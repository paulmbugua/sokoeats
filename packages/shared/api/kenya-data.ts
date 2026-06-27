export type KenyaCategory = { id: string; name: string; icon: string; description: string };

export type KenyaService = { id: string; categoryId: string; name: string; typicalPriceMin: number; typicalPriceMax: number };

export type KenyaEstate = { id: string; name: string; city: string; county: string };



export const categories: KenyaCategory[] = [

  { id: 'plumbing', name: 'Plumbing', icon: 'water-outline', description: 'Leaks, taps, tanks, drainage and bathroom repairs' },

  { id: 'electrical', name: 'Electrical', icon: 'flash-outline', description: 'Sockets, lighting, faults, wiring and appliances' },

  { id: 'painting', name: 'Painting', icon: 'color-palette-outline', description: 'Interior, exterior, touch-ups and finishing' },

  { id: 'carpentry', name: 'Carpentry', icon: 'hammer-outline', description: 'Doors, cabinets, wardrobes and furniture repairs' },

  { id: 'cleaning', name: 'Cleaning', icon: 'sparkles-outline', description: 'Homes, offices, move-in and post-construction cleaning' },

  { id: 'masonry', name: 'Masonry', icon: 'business-outline', description: 'Tiles, concrete, walls, floors and small builds' },

  { id: 'appliances', name: 'Appliances', icon: 'construct-outline', description: 'Cookers, fridges, washers and appliance repair' },

  { id: 'security', name: 'Security', icon: 'lock-closed-outline', description: 'Locks, grills, CCTV, alarms and access control' },

  { id: 'gardening', name: 'Gardening', icon: 'leaf-outline', description: 'Landscaping, lawn care, trimming and outdoor cleanup' },

  { id: 'pest-control', name: 'Pest Control', icon: 'bug-outline', description: 'Fumigation and pest treatment' },

  { id: 'moving', name: 'Moving', icon: 'cube-outline', description: 'House moving, labour, packing and deliveries' },

  { id: 'solar', name: 'Solar & Inverter', icon: 'sunny-outline', description: 'Solar panels, batteries and backup power' },

];



export const services: KenyaService[] = [

  { id: 'tap-repair', categoryId: 'plumbing', name: 'Tap or shower repair', typicalPriceMin: 1000, typicalPriceMax: 3500 },

  { id: 'leak-repair', categoryId: 'plumbing', name: 'Pipe leak repair', typicalPriceMin: 1500, typicalPriceMax: 6000 },

  { id: 'blocked-drain', categoryId: 'plumbing', name: 'Blocked drain or toilet', typicalPriceMin: 2000, typicalPriceMax: 8000 },

  { id: 'water-tank', categoryId: 'plumbing', name: 'Water tank or pump issue', typicalPriceMin: 2500, typicalPriceMax: 12000 },

  { id: 'socket-switch', categoryId: 'electrical', name: 'Socket or switch repair', typicalPriceMin: 800, typicalPriceMax: 3000 },

  { id: 'lighting', categoryId: 'electrical', name: 'Lighting installation', typicalPriceMin: 1200, typicalPriceMax: 7000 },

  { id: 'fault-finding', categoryId: 'electrical', name: 'Power fault diagnosis', typicalPriceMin: 1500, typicalPriceMax: 8000 },

  { id: 'cooker-install', categoryId: 'electrical', name: 'Cooker or appliance connection', typicalPriceMin: 1500, typicalPriceMax: 6500 },

  { id: 'room-painting', categoryId: 'painting', name: 'Room painting', typicalPriceMin: 4500, typicalPriceMax: 18000 },

  { id: 'full-house-painting', categoryId: 'painting', name: 'Full house painting', typicalPriceMin: 18000, typicalPriceMax: 90000 },

  { id: 'touch-up', categoryId: 'painting', name: 'Wall touch-up and patching', typicalPriceMin: 1500, typicalPriceMax: 8000 },

  { id: 'door-repair', categoryId: 'carpentry', name: 'Door or lock fitting', typicalPriceMin: 1500, typicalPriceMax: 8500 },

  { id: 'cabinet-repair', categoryId: 'carpentry', name: 'Cabinet or wardrobe repair', typicalPriceMin: 2500, typicalPriceMax: 20000 },

  { id: 'furniture-assembly', categoryId: 'carpentry', name: 'Furniture assembly', typicalPriceMin: 1500, typicalPriceMax: 9000 },

  { id: 'deep-clean', categoryId: 'cleaning', name: 'Deep cleaning', typicalPriceMin: 3500, typicalPriceMax: 25000 },

  { id: 'sofa-cleaning', categoryId: 'cleaning', name: 'Sofa and carpet cleaning', typicalPriceMin: 2500, typicalPriceMax: 18000 },

  { id: 'post-construction-clean', categoryId: 'cleaning', name: 'Post-construction cleaning', typicalPriceMin: 6000, typicalPriceMax: 45000 },

  { id: 'tile-repair', categoryId: 'masonry', name: 'Tile repair or replacement', typicalPriceMin: 2500, typicalPriceMax: 25000 },

  { id: 'wall-repair', categoryId: 'masonry', name: 'Wall crack or plaster repair', typicalPriceMin: 2500, typicalPriceMax: 30000 },

  { id: 'fridge-repair', categoryId: 'appliances', name: 'Fridge repair', typicalPriceMin: 2500, typicalPriceMax: 15000 },

  { id: 'washer-repair', categoryId: 'appliances', name: 'Washing machine repair', typicalPriceMin: 2500, typicalPriceMax: 18000 },

  { id: 'locksmith', categoryId: 'security', name: 'Locksmith service', typicalPriceMin: 1500, typicalPriceMax: 8000 },

  { id: 'cctv-install', categoryId: 'security', name: 'CCTV installation', typicalPriceMin: 5000, typicalPriceMax: 60000 },

  { id: 'garden-cleanup', categoryId: 'gardening', name: 'Garden cleanup', typicalPriceMin: 2500, typicalPriceMax: 15000 },

  { id: 'fumigation', categoryId: 'pest-control', name: 'Fumigation', typicalPriceMin: 3000, typicalPriceMax: 25000 },

  { id: 'house-moving', categoryId: 'moving', name: 'House moving support', typicalPriceMin: 5000, typicalPriceMax: 45000 },

  { id: 'solar-diagnosis', categoryId: 'solar', name: 'Solar system diagnosis', typicalPriceMin: 2500, typicalPriceMax: 15000 },

];



export const estates: KenyaEstate[] = ['Kilimani', 'Kileleshwa', 'Westlands', 'Lavington', 'Parklands', 'South B', 'South C', 'Langata', 'Karen', 'Runda', 'Roysambu', 'Kasarani', 'Zimmerman', 'Thome', 'Embakasi', 'Donholm', 'Umoja', 'Buruburu', 'Kahawa Sukari', 'Ruaka', 'Kitengela', 'Syokimau', 'Athi River', 'Rongai', 'Ngong', 'Juja', 'Ruiru', 'Kiambu', 'Mlolongo', 'Utawala'].map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, city: 'Nairobi', county: ['Kitengela', 'Athi River', 'Ngong', 'Rongai'].includes(name) ? 'Kajiado' : ['Juja', 'Ruiru', 'Kiambu'].includes(name) ? 'Kiambu' : 'Nairobi' }));

