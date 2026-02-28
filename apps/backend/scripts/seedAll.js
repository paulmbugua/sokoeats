// apps/backend/src/seed/seedAll.js

import { createId } from '../db/memoryDb.js';
import {
  CATEGORIES,
  TASKS,
  NAIROBI_LOCATIONS,
} from '../../../packages/shared/api/kenya-data.js';

export function seedAll(state) {
  // Categories + Services
  state.categories = CATEGORIES.map((c, idx) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: idx + 1,
  }));

  state.services = Object.entries(TASKS).flatMap(([catId, tasks]) =>
    tasks.map((name, idx) => ({
      id: `${catId}:${idx + 1}`,
      categoryId: catId,
      name,
      sortOrder: idx + 1,
    }))
  );

  state.estates = NAIROBI_LOCATIONS.map((name, idx) => ({
    id: `nai:${idx + 1}`,
    name,
    city: 'Nairobi',
  }));

  // Demo pros
  state.pros = [
    {
      id: 'pro_1',
      name: 'James Kamau',
      avatarUrl: null,
      ratingAvg: 4.9,
      ratingCount: 127,
      verifiedId: true,
      backgroundChecked: true,
      topRated: true,
      jobsCompleted: 320,
      tags: ['Fast', 'Best Value', 'Clean Work'],
      bio: 'Reliable handyman with 8+ years experience in Nairobi.',
    },
    {
      id: 'pro_2',
      name: 'Peter Omondi',
      avatarUrl: null,
      ratingAvg: 4.8,
      ratingCount: 89,
      verifiedId: true,
      backgroundChecked: false,
      topRated: false,
      jobsCompleted: 190,
      tags: ['Friendly', 'Transparent Pricing'],
      bio: 'Electrical & plumbing specialist.',
    },
    {
      id: 'pro_3',
      name: 'John Mwangi',
      avatarUrl: null,
      ratingAvg: 4.7,
      ratingCount: 64,
      verifiedId: false,
      backgroundChecked: false,
      topRated: false,
      jobsCompleted: 120,
      tags: ['Budget'],
      bio: 'Affordable repairs and installations.',
    },
  ];

  // Demo user
  state.users = [
    {
      id: 'user_demo_1',
      name: 'Paul',
      phone: '+254700000000',
      email: 'paul@example.com',
      createdAt: new Date().toISOString(),
    },
  ];

  // Demo job + quotes
  const jobId = 'job_demo_1';
  state.jobs = [
    {
      id: jobId,
      userId: 'user_demo_1',
      categoryId: 'plumbing',
      serviceId: 'plumbing:1',
      description: 'Leaking tap in kitchen — needs urgent repair.',
      photoUrls: [],
      estate: 'Kilimani',
      city: 'Nairobi',
      scheduleType: 'ASAP',
      scheduledFor: null,
      budgetMin: 2000,
      budgetMax: 5000,
      providerBringsMaterials: true,
      notes: 'Please call when arriving.',
      status: 'quoted',
      quoteCount: 3,
      assignedPro: null,
      createdAt: new Date().toISOString(),
    },
  ];

  state.quotes = [
    {
      id: 'q1',
      jobId,
      proId: 'pro_1',
      total: 3000,
      labor: 1800,
      materials: 900,
      transport: 300,
      etaMinutes: 10,
      distanceKm: 2.3,
      message: 'I can arrive in 10 mins. Warranty on the fix.',
      badge: 'Best Value',
      status: 'open',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'q2',
      jobId,
      proId: 'pro_2',
      total: 3500,
      labor: 2100,
      materials: 1050,
      transport: 350,
      etaMinutes: 15,
      distanceKm: 3.1,
      message: 'Quality parts, professional finish.',
      badge: null,
      status: 'open',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'q3',
      jobId,
      proId: 'pro_3',
      total: 4000,
      labor: 2400,
      materials: 1200,
      transport: 400,
      etaMinutes: 30,
      distanceKm: 5.8,
      message: 'I can do it this afternoon.',
      badge: 'Top Rated',
      status: 'open',
      createdAt: new Date().toISOString(),
    },
  ];

  // Helpful helper for new objects later
  state._createId = createId;
}
