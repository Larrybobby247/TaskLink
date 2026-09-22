/* eslint-disable no-console */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, Category, WorkerProfile, Task, Application, Order, Review, PlatformSetting } from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';
import { calculatePlatformFeeKobo } from '../src/utils/money.js';

const CATEGORY_SEED = [
  { name: 'Graphic Design', slug: 'graphic-design', icon: 'palette' },
  { name: 'Writing', slug: 'writing', icon: 'file-text' },
  { name: 'CV/Resume', slug: 'cv-resume', icon: 'file-text' },
  { name: 'Website Development', slug: 'website-development', icon: 'code' },
  { name: 'Video Editing', slug: 'video-editing', icon: 'video' },
  { name: 'Social Media', slug: 'social-media', icon: 'share-2' },
  { name: 'Typing/Data Entry', slug: 'typing-data-entry', icon: 'keyboard' },
  { name: 'Delivery', slug: 'delivery', icon: 'truck' },
  { name: 'Tutoring', slug: 'tutoring', icon: 'graduation-cap' },
  { name: 'Photography', slug: 'photography', icon: 'camera' },
  { name: 'Cleaning', slug: 'cleaning', icon: 'brush' },
  { name: 'Event Help', slug: 'event-help', icon: 'calendar' },
  { name: 'Repairs', slug: 'repairs', icon: 'wrench' },
  { name: 'Other', slug: 'other', icon: 'more-horizontal' },
];

async function seed() {
  console.log('[seed] --- THIS SCRIPT CREATES DEVELOPMENT/TEST DATA ONLY. Never run against production. ---');
  await connectDB();

  await PlatformSetting.findOneAndUpdate({ key: 'GLOBAL' }, { key: 'GLOBAL' }, { upsert: true });

  console.log('[seed] Seeding categories...');
  const categories = [];
  for (const c of CATEGORY_SEED) {
    const cat = await Category.findOneAndUpdate({ slug: c.slug }, c, { upsert: true, new: true });
    categories.push(cat);
  }
  const byName = (name) => categories.find((c) => c.name === name);

  console.log('[seed] Seeding users...');
  const passwordHash = await hashPassword('Password123!');

  const client = await User.findOneAndUpdate(
    { email: 'client.seed@tasklink.ng' },
    {
      fullName: 'Sarah Miller', username: 'sarahm_seed', email: 'client.seed@tasklink.ng', phone: '08010000001',
      passwordHash, emailVerified: true, currentMode: 'client', location: 'Ibadan',
    },
    { upsert: true, new: true }
  );

  const worker = await User.findOneAndUpdate(
    { email: 'worker.seed@tasklink.ng' },
    {
      fullName: 'Abdullah Bello', username: 'abdullah_seed', email: 'worker.seed@tasklink.ng', phone: '08010000002',
      passwordHash, emailVerified: true, currentMode: 'worker', location: 'Ibadan', rating: 4.8, reviewCount: 8,
      completedTasksAsWorker: 12,
    },
    { upsert: true, new: true }
  );

  const admin = await User.findOneAndUpdate(
    { email: 'admin.seed@tasklink.ng' },
    {
      fullName: 'TaskLink Admin', username: 'admin_seed', email: 'admin.seed@tasklink.ng', phone: '08010000003',
      passwordHash, emailVerified: true, role: 'ADMIN',
    },
    { upsert: true, new: true }
  );

  await WorkerProfile.findOneAndUpdate(
    { user: worker._id },
    {
      user: worker._id, headline: 'Graphic designer & flyer specialist', skills: ['graphic design', 'flyer design', 'canva'],
      categories: [byName('Graphic Design')._id], isComplete: true, availability: 'AVAILABLE',
    },
    { upsert: true }
  );

  console.log('[seed] Seeding tasks...');
  const now = Date.now();
  const taskDefs = [
    { title: 'Need a flyer designed today', description: 'Simple promotional flyer for a birthday party, A4 size, needed within 6 hours.', category: byName('Graphic Design')._id, budgetKobo: 150000, location: 'Online', isRemote: true, deadline: new Date(now + 6 * 3600 * 1000), status: 'PUBLISHED' },
    { title: 'Need someone to type an assignment', description: 'Type a 24-page handwritten assignment into a Word document with correct formatting.', category: byName('Typing/Data Entry')._id, budgetKobo: 300000, location: 'LASU', isRemote: true, deadline: new Date(now + 24 * 3600 * 1000), status: 'PUBLISHED' },
    { title: 'Delivery across campus', description: 'Pick up a package from the main gate and deliver to Hall 3.', category: byName('Delivery')._id, budgetKobo: 100000, location: 'LASU', isRemote: false, deadline: new Date(now + 3 * 3600 * 1000), status: 'PUBLISHED' },
    { title: 'Looking for a photographer (2 hours)', description: 'Cover a small graduation photoshoot, 2 hours, edited photos delivered same day.', category: byName('Photography')._id, budgetKobo: 1000000, location: 'Ibadan', isRemote: false, deadline: new Date(now + 2 * 3600 * 1000), status: 'PUBLISHED' },
    { title: 'Build me a simple website', description: 'A 3-page portfolio website with a contact form.', category: byName('Website Development')._id, budgetKobo: 3000000, location: 'Online', isRemote: true, deadline: new Date(now + 2 * 24 * 3600 * 1000), status: 'PUBLISHED' },
  ];

  for (const def of taskDefs) {
    await Task.findOneAndUpdate(
      { title: def.title, client: client._id },
      { ...def, client: client._id, publishedAt: new Date() },
      { upsert: true }
    );
  }

  console.log('[seed] Done. Seeded accounts (password: Password123!):');
  console.log(`  Client: ${client.email}`);
  console.log(`  Worker: ${worker.email}`);
  console.log(`  Admin:  ${admin.email}`);

  await disconnectDB();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
