
/* eslint-disable no-console */

// Development/test seeder only.
// NEVER run this script against production data.

import { connectDB, disconnectDB } from '../src/config/db.js';
import {
  User,
  Category,
  WorkerProfile,
  Task,
  PlatformSetting,
} from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';

// Prevent accidental execution against production.
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    '[seed] Aborted: development seed script cannot run in production.'
  );
}

const CATEGORY_SEED = [
  { name: 'Graphic Design', slug: 'graphic-design', icon: 'palette' },
  { name: 'Writing', slug: 'writing', icon: 'file-text' },
  { name: 'CV/Resume', slug: 'cv-resume', icon: 'file-text' },
  { name: 'Website Development', slug: 'website-development', icon: 'code' },
  { name: 'Video Editing', slug: 'video-editing', icon: 'video' },
  { name: 'Social Media', slug: 'social-media', icon: 'share-2' },
  { name: 'Typing/Data Entry', slug: 'typing-data-entry', icon: 'keyboard' },
  { name: 'Tutoring', slug: 'tutoring', icon: 'graduation-cap' },
  { name: 'Virtual Assistance', slug: 'virtual-assistance', icon: 'headset' },
  { name: 'Data Analysis', slug: 'data-analysis', icon: 'bar-chart-3' },
  { name: 'Other', slug: 'other', icon: 'more-horizontal' },
];

const REMOVED_CATEGORY_SLUGS = [
  'delivery',
  'photography',
  'cleaning',
  'event-help',
  'repairs',
];

const SEED_CLIENT_EMAIL = 'client.seed@tasklink.ng';
const SEED_WORKER_EMAIL = 'worker.seed@tasklink.ng';
const SEED_ADMIN_EMAIL = 'admin.seed@tasklink.ng';

const SEED_PASSWORD = 'Password123!';

async function seed() {
  let connected = false;

  try {
    console.log('[seed] Starting development seed...');

    await connectDB();
    connected = true;

    // Ensure the global platform setting exists.
    await PlatformSetting.findOneAndUpdate(
      { key: 'GLOBAL' },
      { $setOnInsert: { key: 'GLOBAL' } },
      { upsert: true, new: true }
    );

    // Seed categories first so we can reference the "Other" category
    // while safely handling old category references.
    console.log('[seed] Seeding categories...');

    const categories = [];

    for (const category of CATEGORY_SEED) {
      const savedCategory = await Category.findOneAndUpdate(
        { slug: category.slug },
        { $set: category },
        { upsert: true, new: true, runValidators: true }
      );

      categories.push(savedCategory);
    }

    const byName = (name) =>
      categories.find((category) => category.name === name);

    const otherCategory = byName('Other');

    if (!otherCategory) {
      throw new Error('[seed] Required "Other" category was not created.');
    }

    // Find categories that should be removed.
    const removedCategories = await Category.find({
      slug: { $in: REMOVED_CATEGORY_SLUGS },
    }).select('_id slug');

    const removedCategoryIds = removedCategories.map(
      (category) => category._id
    );

    // Create or update seed accounts.
    console.log('[seed] Seeding users...');

    const passwordHash = await hashPassword(SEED_PASSWORD);

    const client = await User.findOneAndUpdate(
      { email: SEED_CLIENT_EMAIL },
      {
        $set: {
          fullName: 'Sarah Miller',
          username: 'sarahm_seed',
          email: SEED_CLIENT_EMAIL,
          phone: '08010000001',
          passwordHash,
          emailVerified: true,
          currentMode: 'client',
          location: 'Ibadan',
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    const worker = await User.findOneAndUpdate(
      { email: SEED_WORKER_EMAIL },
      {
        $set: {
          fullName: 'Abdullah Bello',
          username: 'abdullah_seed',
          email: SEED_WORKER_EMAIL,
          phone: '08010000002',
          passwordHash,
          emailVerified: true,
          currentMode: 'worker',
          location: 'Ibadan',
          rating: 4.8,
          reviewCount: 8,
          completedTasksAsWorker: 12,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    const admin = await User.findOneAndUpdate(
      { email: SEED_ADMIN_EMAIL },
      {
        $set: {
          fullName: 'TaskLink Admin',
          username: 'admin_seed',
          email: SEED_ADMIN_EMAIL,
          phone: '08010000003',
          passwordHash,
          emailVerified: true,
          role: 'ADMIN',
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Update the worker profile.
    await WorkerProfile.findOneAndUpdate(
      { user: worker._id },
      {
        $set: {
          user: worker._id,
          headline: 'Graphic designer & flyer specialist',
          skills: ['graphic design', 'flyer design', 'canva'],
          categories: [byName('Graphic Design')._id],
          isComplete: true,
          availability: 'AVAILABLE',
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Move only this script's old sample tasks to "Other".
    // This avoids breaking existing orders or deleting sample task history.
    if (removedCategoryIds.length > 0) {
      console.log('[seed] Checking old sample tasks...');

      const migrated = await Task.updateMany(
        {
          client: client._id,
          category: { $in: removedCategoryIds },
        },
        {
          $set: { category: otherCategory._id },
        }
      );

      console.log(
        `[seed] Migrated ${migrated.modifiedCount} sample task(s) to Other.`
      );

      // Remove obsolete category IDs from worker profiles.
      await WorkerProfile.updateMany(
        { categories: { $in: removedCategoryIds } },
        { $pull: { categories: { $in: removedCategoryIds } } }
      );

      // Do not delete a category if real or unrelated tasks still use it.
      const remainingReferences = await Task.find({
        category: { $in: removedCategoryIds },
      })
        .select('_id title category')
        .limit(10)
        .lean();

      if (remainingReferences.length > 0) {
        const details = remainingReferences
          .map((task) => `${task.title} (${task._id})`)
          .join('\n');

        throw new Error(
          '[seed] Cannot delete old categories because other tasks still ' +
            `reference them. Review these tasks first:\n${details}`
        );
      }

      // Remove obsolete categories only after checking references.
      const deletion = await Category.deleteMany({
        _id: { $in: removedCategoryIds },
      });

      console.log(
        `[seed] Deleted ${deletion.deletedCount} obsolete categories.`
      );
    }

    // Seed current online tasks.
    console.log('[seed] Seeding tasks...');

    const now = Date.now();

    const taskDefs = [
      {
        title: 'Need a flyer designed today',
        description:
          'Create a simple promotional flyer for a birthday party. ' +
          'The design should be A4 size and delivered as a high-quality ' +
          'digital file within 6 hours.',
        category: byName('Graphic Design')._id,
        budgetKobo: 150000,
        location: 'Online',
        isRemote: true,
        deadline: new Date(now + 6 * 60 * 60 * 1000),
        status: 'PUBLISHED',
      },
      {
        title: 'Need someone to type an assignment',
        description:
          'Type a 24-page handwritten assignment into a Microsoft Word ' +
          'document. Apply proper formatting, headings, and page numbering.',
        category: byName('Typing/Data Entry')._id,
        budgetKobo: 300000,
        location: 'Online',
        isRemote: true,
        deadline: new Date(now + 24 * 60 * 60 * 1000),
        status: 'PUBLISHED',
      },
      {
        title: 'Research 20 Nigerian tech startups',
        description:
          'Find 20 Nigerian tech startups and collect their names, ' +
          'websites, public contact emails, and locations. Organize the ' +
          'verified information in a Google Sheet.',
        category: byName('Virtual Assistance')._id,
        budgetKobo: 500000,
        location: 'Online',
        isRemote: true,
        deadline: new Date(now + 2 * 24 * 60 * 60 * 1000),
        status: 'PUBLISHED',
      },
      {
        title: 'Analyze sales data and create a report',
        description:
          'Analyze a provided Excel spreadsheet containing monthly sales ' +
          'data. Calculate total revenue, identify sales trends and ' +
          'top-performing products, and create a simple visual report.',
        category: byName('Data Analysis')._id,
        budgetKobo: 800000,
        location: 'Online',
        isRemote: true,
        deadline: new Date(now + 3 * 24 * 60 * 60 * 1000),
        status: 'PUBLISHED',
      },
      {
        title: 'Build me a simple website',
        description:
          'Build a responsive three-page portfolio website with a ' +
          'working contact form. Include a homepage, about page, ' +
          'and contact page.',
        category: byName('Website Development')._id,
        budgetKobo: 3000000,
        location: 'Online',
        isRemote: true,
        deadline: new Date(now + 2 * 24 * 60 * 60 * 1000),
        status: 'PUBLISHED',
      },
    ];

    for (const task of taskDefs) {
      await Task.findOneAndUpdate(
        {
          title: task.title,
          client: client._id,
        },
        {
          $set: {
            ...task,
            client: client._id,
            publishedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        }
      );
    }

    console.log('[seed] Successfully completed.');
    console.log('[seed] Seed accounts (password: Password123!):');
    console.log(`  Client: ${client.email}`);
    console.log(`  Worker: ${worker.email}`);
    console.log(`  Admin:  ${admin.email}`);
  } catch (error) {
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await disconnectDB();
        console.log('[seed] Database disconnected.');
      } catch (disconnectError) {
        console.error('[seed] Database disconnect failed:', disconnectError);
        process.exitCode = 1;
      }
    }
  }
}

seed();