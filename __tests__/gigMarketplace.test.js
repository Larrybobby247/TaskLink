import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, Category, Gig, WorkerProfile } from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';
import * as gigService from '../src/services/gig.service.js';
import * as workerService from '../src/services/worker.service.js';

let mongod;
let category;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  category = await Category.create({ name: 'Graphic Design', slug: 'graphic-design' });
});

async function makeUser(overrides = {}) {
  const passwordHash = await hashPassword('Password123!');
  const n = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  return User.create({
    fullName: 'Test User', username: `user_${n}`, email: `${n}@test.com`, phone: '08000000000',
    passwordHash, emailVerified: true, ...overrides,
  });
}

const makeGig = (worker, overrides = {}) =>
  Gig.create({
    worker: worker._id, title: 'I will design a logo', category: category._id,
    description: 'A professional logo design with source files included.',
    startingPriceKobo: 500000, deliveryDays: 3, status: 'PUBLISHED', publishedAt: new Date(),
    coverImage: { url: 'https://example.com/a.jpg', publicId: 'a' }, ...overrides,
  });

const page = { skip: 0, limit: 20 };

describe('worker search', () => {
  it('finds a worker by exact and PARTIAL username, case-insensitively, and never leaks private fields', async () => {
    const larry = await makeUser({ username: 'larrydev', email: 'larry@secret.com', phone: '08011111111' });
    await WorkerProfile.create({ user: larry._id, headline: 'Designer', skills: ['logo'] });

    for (const q of ['larrydev', 'LARRY', '@larry', 'rrydev']) {
      const { items, total } = await workerService.searchWorkers({ q, ...page });
      expect(total).toBe(1);
      expect(items[0].user.username).toBe('larrydev');
      expect(JSON.stringify(items[0])).not.toContain('larry@secret.com');
      expect(JSON.stringify(items[0])).not.toContain('08011111111');
    }
  });

  it('ranks the exact username first and excludes suspended accounts', async () => {
    const exact = await makeUser({ username: 'sam' });
    const partial = await makeUser({ username: 'samuel', rating: 5 });
    const suspended = await makeUser({ username: 'sammy', accountStatus: 'SUSPENDED' });
    await Promise.all([exact, partial, suspended].map((u) => WorkerProfile.create({ user: u._id })));

    const { items } = await workerService.searchWorkers({ q: 'sam', ...page });
    expect(items.map((i) => i.user.username)).toEqual(['sam', 'samuel']);
  });

  it('matches by gig title, reports real gig count and starting price', async () => {
    const w = await makeUser({ username: 'pixelpro' });
    await WorkerProfile.create({ user: w._id });
    await makeGig(w, { title: 'Flyer design', startingPriceKobo: 300000 });
    await makeGig(w, { title: 'Brand kit', startingPriceKobo: 900000 });
    await makeGig(w, { title: 'Draft only gig', status: 'DRAFT', startingPriceKobo: 100 });

    const { items } = await workerService.searchWorkers({ q: 'flyer', ...page });
    expect(items).toHaveLength(1);
    expect(items[0].publishedGigCount).toBe(2);
    expect(items[0].startingPriceKobo).toBe(300000);
  });
});

describe('public profile', () => {
  it('resolves by username (any case) and exposes no private fields', async () => {
    const w = await makeUser({
      username: 'larrydev', email: 'larry@secret.com', phone: '08011111111',
      bankDetails: { accountNumber: '0123456789', bankName: 'X' },
    });
    await WorkerProfile.create({
      user: w._id, headline: 'Hi',
      bankAccount: { bankName: 'X', accountNumberLast4: '6789', recipientCode: 'RCP_1' },
    });

    const { user, profile } = await workerService.getWorkerPublicProfile('LarryDev');
    const body = JSON.stringify({ user: user.toPublicJSON(), profile });
    expect(body).toContain('larrydev');
    for (const secret of ['larry@secret.com', '08011111111', '0123456789', 'RCP_1', 'bankAccount', 'bankDetails']) {
      expect(body).not.toContain(secret);
    }
  });

  it('404s for suspended accounts', async () => {
    const w = await makeUser({ username: 'gone', accountStatus: 'SUSPENDED' });
    await expect(workerService.getWorkerPublicProfile(String(w._id))).rejects.toThrow('Worker not found');
  });
});

describe('gig visibility and plan limits', () => {
  it('lets only the owner (or an admin) open a draft gig', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const admin = await makeUser({ role: 'ADMIN' });
    const draft = await makeGig(owner, { status: 'DRAFT' });

    await expect(gigService.getGigById(draft._id)).rejects.toThrow('not available');
    await expect(gigService.getGigById(draft._id, { viewer: stranger })).rejects.toThrow('not available');
    expect((await gigService.getGigById(draft._id, { viewer: owner })).isOwner).toBe(true);
    await expect(gigService.getGigById(draft._id, { viewer: admin })).resolves.toBeTruthy();
  });

  it('treats a malformed id as 404, not a crash', async () => {
    await expect(gigService.getGigById('not-an-id')).rejects.toThrow('Gig not found');
  });

  it('enforces the Free limit on publish, server-side', async () => {
    const worker = await makeUser({ plan: 'FREE' });
    for (let i = 0; i < 3; i += 1) await makeGig(worker, { title: `Published gig ${i}` });
    const extra = await makeGig(worker, { status: 'DRAFT', title: 'One too many' });

    await expect(gigService.publishGig(worker, extra._id)).rejects.toThrow(/limit of 3/);
  });

  it('gives Pro the higher limit, but not once the Pro period has expired', async () => {
    const activePro = await makeUser({ plan: 'PRO', proExpiresAt: new Date(Date.now() + 86400000) });
    for (let i = 0; i < 3; i += 1) await makeGig(activePro, { title: `Gig ${i}` });
    const fourth = await makeGig(activePro, { status: 'DRAFT', title: 'Fourth' });
    await expect(gigService.publishGig(activePro, fourth._id)).resolves.toBeTruthy();

    const expiredPro = await makeUser({ plan: 'PRO', proExpiresAt: new Date(Date.now() - 86400000) });
    for (let i = 0; i < 3; i += 1) await makeGig(expiredPro, { title: `Old gig ${i}` });
    const blocked = await makeGig(expiredPro, { status: 'DRAFT', title: 'Blocked' });
    await expect(gigService.publishGig(expiredPro, blocked._id)).rejects.toThrow(/limit of 3/);
  });

  it("won't publish without a cover image and won't let another user publish or edit", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const noCover = await makeGig(owner, { status: 'DRAFT', coverImage: undefined });
    await expect(gigService.publishGig(owner, noCover._id)).rejects.toThrow(/cover image/);

    const gig = await makeGig(owner, { status: 'DRAFT' });
    await expect(gigService.publishGig(other, gig._id)).rejects.toThrow(/do not own/);
    await expect(gigService.updateGig(other, gig._id, { title: 'Hijacked' })).rejects.toThrow(/do not own/);
  });
});

describe('gig search', () => {
  it('finds gigs by partial worker username, title and category name; hides drafts', async () => {
    const w = await makeUser({ username: 'larrydev' });
    await makeGig(w, { title: 'Logo design' });
    await makeGig(w, { title: 'Secret draft', status: 'DRAFT' });

    for (const q of ['larry', 'logo', 'graphic']) {
      const { items } = await gigService.searchGigs({ q, ...page });
      expect(items.map((g) => g.title)).toEqual(['Logo design']);
    }
    expect((await gigService.searchGigs({ q: 'nomatch', ...page })).total).toBe(0);
  });

  it('featured skips workers who set themselves unavailable and never fabricates ratings', async () => {
    const available = await makeUser();
    const away = await makeUser();
    await WorkerProfile.create({ user: available._id, availability: 'AVAILABLE' });
    await WorkerProfile.create({ user: away._id, availability: 'UNAVAILABLE' });
    await makeGig(available, { title: 'Visible' });
    await makeGig(away, { title: 'Hidden' });

    const featured = await gigService.getFeaturedGigs(6);
    expect(featured.map((g) => g.title)).toEqual(['Visible']);
    expect(featured[0].worker.rating).toBe(0);
  });
});
