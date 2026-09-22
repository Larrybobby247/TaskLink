import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, Category, Task } from '../src/models/index.js';
import { hashPassword } from '../src/services/auth.service.js';
import { applyToTask } from '../src/services/application.service.js';

let mongod;

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
});

async function makeUser(overrides = {}) {
  const passwordHash = await hashPassword('Password123!');
  return User.create({
    fullName: 'Test User', username: `user_${Date.now()}_${Math.random()}`, email: `${Date.now()}${Math.random()}@test.com`,
    phone: '08000000000', passwordHash, emailVerified: true, ...overrides,
  });
}

describe('business rule: a user cannot apply to their own task', () => {
  it('rejects self-application', async () => {
    const client = await makeUser();
    const category = await Category.create({ name: 'Writing', slug: 'writing' });
    const task = await Task.create({
      client: client._id, title: 'Type a document', description: 'A'.repeat(30), category: category._id,
      budgetKobo: 100000, deadline: new Date(Date.now() + 3600 * 1000), status: 'PUBLISHED',
    });

    await expect(applyToTask(client, task._id, { message: 'I can do this for you please' })).rejects.toThrow(/own task/i);
  });
});

describe('business rule: duplicate applications are prevented', () => {
  it('rejects a second application from the same worker', async () => {
    const client = await makeUser();
    const worker = await makeUser();
    const category = await Category.create({ name: 'Writing', slug: 'writing' });
    const task = await Task.create({
      client: client._id, title: 'Type a document', description: 'A'.repeat(30), category: category._id,
      budgetKobo: 100000, deadline: new Date(Date.now() + 3600 * 1000), status: 'PUBLISHED',
    });

    await applyToTask(worker, task._id, { message: 'I can do this for you please' });
    await expect(applyToTask(worker, task._id, { message: 'Applying again please' })).rejects.toThrow(/already applied/i);
  });
});

describe('business rule: expired tasks reject new applications', () => {
  it('rejects application after deadline', async () => {
    const client = await makeUser();
    const worker = await makeUser();
    const category = await Category.create({ name: 'Writing', slug: 'writing' });
    const task = await Task.create({
      client: client._id, title: 'Type a document', description: 'A'.repeat(30), category: category._id,
      budgetKobo: 100000, deadline: new Date(Date.now() - 3600 * 1000), status: 'PUBLISHED',
    });

    await expect(applyToTask(worker, task._id, { message: 'I can do this for you please' })).rejects.toThrow(/expired/i);
  });
});
