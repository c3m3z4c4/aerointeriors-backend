const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const org = await prisma.organization.upsert({
    where: { slug: 'aerointeriors' },
    update: {},
    create: { name: 'Aircraft Interiors Solutions', slug: 'aerointeriors' },
  });

  console.log('Org:', org.id);

  const password_hash = await bcrypt.hash('Admin@2024!', 12);
  await prisma.profile.upsert({
    where: { email: 'admin@air-interiors.com' },
    update: {},
    create: { email: 'admin@air-interiors.com', password_hash, name: 'Admin', role: 'admin' },
  });

  await prisma.siteSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      companyName: 'Aircraft Interiors Solutions',
      heroTagline_en: 'We Do The Best For Interiors',
      heroTagline_es: 'Hacemos Lo Mejor Para Interiores',
      heroTitle_en: 'Aircraft Interior',
      heroTitle_es: 'Interiores de Aeronaves',
      heroTitleHighlight: 'Solutions',
      heroCta1_en: 'Explore Our Work',
      heroCta1_es: 'Ver Proyectos',
      heroCta2_en: 'Request a Quote',
      heroCta2_es: 'Solicitar Cotización',
      email: 'info@air-interiors.com',
      phone: '+1 (800) 555-0100',
      address: 'Aviation Business Park, Suite 200, Los Angeles, CA 90045',
      footerText_en: 'Crafting excellence at 40,000 feet.',
      footerText_es: 'Excelencia artesanal a 40,000 pies.',
    },
  });

  const services = [
    { title_en: 'Full Interiors', title_es: 'Interiores Completos', description_en: 'Complete aircraft interior design and installation from concept to delivery. We handle every detail of your cabin transformation.', description_es: 'Diseño e instalación completa de interiores de aeronaves desde el concepto hasta la entrega.', icon: 'Crown', order: 0 },
    { title_en: 'Wood Working & Refreshing', title_es: 'Carpintería y Renovación', description_en: 'Expert wood veneer work, cabinetry restoration, and surface refinishing to restore the elegance of your aircraft interior.', description_es: 'Trabajo experto en chapa de madera, restauración de gabinetes y acabados superficiales.', icon: 'Hammer', order: 1 },
    { title_en: 'Cabin Modification', title_es: 'Modificación de Cabina', description_en: 'Custom cabin layout changes, bulkhead modifications, and configuration upgrades to maximize space and functionality.', description_es: 'Cambios de distribución de cabina, modificaciones de mamparas y actualizaciones de configuración.', icon: 'Wrench', order: 2 },
    { title_en: 'Carpet & Flooring', title_es: 'Alfombras y Pisos', description_en: 'Premium aviation carpet installation, hardwood flooring, and custom floor coverings designed for aircraft use.', description_es: 'Instalación de alfombras de aviación premium, pisos de madera y revestimientos personalizados.', icon: 'Layers', order: 3 },
    { title_en: 'Custom Stitching', title_es: 'Costura Personalizada', description_en: 'Bespoke embroidery, monogramming, and custom stitching for headrests, pillows, blankets, and upholstery elements.', description_es: 'Bordado a medida, monogramas y costura personalizada para reposacabezas, almohadas y tapicería.', icon: 'Scissors', order: 4 },
    { title_en: 'Seat Reupholstery', title_es: 'Retapizado de Asientos', description_en: 'Full seat restoration using premium leather, suede, and technical fabrics that meet all aviation safety standards.', description_es: 'Restauración completa de asientos usando cuero premium, gamuza y telas técnicas certificadas.', icon: 'Armchair', order: 5 },
    { title_en: 'LED Lighting Systems', title_es: 'Sistemas LED', description_en: 'Advanced programmable LED cabin lighting, mood lighting systems, reading lights, and emergency lighting upgrades.', description_es: 'Iluminación LED programable avanzada, sistemas de ambiente, luces de lectura y actualizaciones de emergencia.', icon: 'Lightbulb', order: 6 },
    { title_en: 'Leather Repair', title_es: 'Reparación de Cuero', description_en: 'Professional leather restoration, color matching, crack repair, and conditioning services to extend the life of your cabin upholstery.', description_es: 'Restauración profesional de cuero, igualación de colores, reparación de grietas y acondicionamiento.', icon: 'Shield', order: 7 },
    { title_en: 'R&R Custom Inspection', title_es: 'Inspección y Reemplazo', description_en: 'Comprehensive remove and replace inspections ensuring all interior components meet regulatory compliance and safety standards.', description_es: 'Inspecciones integrales de desmontaje y reemplazo para cumplimiento regulatorio y estándares de seguridad.', icon: 'ClipboardCheck', order: 8 },
  ];

  for (const s of services) {
    await prisma.service.create({ data: { orgId: org.id, visible: true, ...s } });
  }

  await prisma.project.createMany({
    data: [
      {
        orgId: org.id,
        title_en: 'Gulfstream G650 VIP Completion',
        title_es: 'Completación VIP Gulfstream G650',
        description_en: 'Full cabin redesign for a private Gulfstream G650. Hand-stitched Italian leather, burl wood accents, custom LED mood lighting, and a state-of-the-art entertainment system. Delivered in 14 weeks with full FAA certification.',
        description_es: 'Rediseño completo de cabina para un Gulfstream G650 privado. Cuero italiano cosido a mano, detalles en madera nudosa, iluminación LED personalizada y sistema de entretenimiento de última generación.',
        images: ['https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800'],
        category: 'vip',
        aircraftType: 'Gulfstream G650',
        client: 'Private Client',
        year: 2023,
        featured: true,
        visible: true,
        order: 0,
        tags: ['Italian Leather', 'Burl Wood', 'FAA Certified', 'LED Lighting'],
      },
      {
        orgId: org.id,
        title_en: 'Boeing BBJ Corporate Refurbishment',
        title_es: 'Renovación Corporativa Boeing BBJ',
        description_en: 'Complete interior refurbishment of a Boeing Business Jet, transforming it into a mobile corporate headquarters with conference rooms, private office, and luxury sleeping quarters.',
        description_es: 'Renovación interior completa de un Boeing Business Jet, transformándolo en sede corporativa móvil con salas de conferencia, oficina privada y lujosos dormitorios.',
        images: ['https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=800'],
        category: 'completions',
        aircraftType: 'Boeing BBJ',
        client: 'Fortune 500 Corp',
        year: 2024,
        featured: false,
        visible: true,
        order: 1,
        tags: ['Conference Room', 'Office Suite', 'Premium Leather'],
      },
    ],
  });

  await prisma.certification.createMany({
    data: [
      { orgId: org.id, title_en: 'FAA Part 145 Repair Station', title_es: 'Estación de Reparación FAA Part 145', issuer: 'Federal Aviation Administration', issueDate: '2019-07-01', credUrl: 'https://www.faa.gov', visible: true, order: 0 },
      { orgId: org.id, title_en: 'EASA Part-21 Design Organisation', title_es: 'Organización de Diseño EASA Part-21', issuer: 'European Union Aviation Safety Agency', issueDate: '2020-03-15', credUrl: 'https://www.easa.europa.eu', visible: true, order: 1 },
    ],
  });

  await prisma.teamMember.createMany({
    data: [
      { orgId: org.id, name: 'Ricardo Montoya', role_en: 'CEO & Chief Design Officer', role_es: 'CEO y Director de Diseño', bio_en: '20+ years in aviation interior design. Former lead designer at Lufthansa Technik. Passionate about merging aerospace engineering with luxury design.', bio_es: 'Más de 20 años en diseño de interiores de aviación. Ex-diseñador principal en Lufthansa Technik.', order: 0, visible: true },
      { orgId: org.id, name: 'Elena Vasquez', role_en: 'Head of Completions', role_es: 'Directora de Completaciones', bio_en: 'Specialized in VIP completions for heads of state. FAA-certified completion engineer with 15 years of experience.', bio_es: 'Especializada en completaciones VIP para jefes de estado. Ingeniera de completaciones certificada por la FAA.', order: 1, visible: true },
    ],
  });

  await prisma.socialLink.createMany({
    data: [
      { orgId: org.id, platform: 'LinkedIn', url: 'https://linkedin.com/company/air-interiors', order: 0 },
      { orgId: org.id, platform: 'Instagram', url: 'https://instagram.com/airinteriorssolutions', order: 1 },
    ],
  });

  console.log('Seed complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
