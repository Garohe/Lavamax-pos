require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creando tablas...');

  await sql`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'empleado'
  )`;

  await sql`CREATE TABLE IF NOT EXISTS tipos_prenda (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    precio_kg NUMERIC(10,2) NOT NULL,
    precio_pieza NUMERIC(10,2) DEFAULT 0,
    modo_cobro TEXT NOT NULL DEFAULT 'kg',
    descripcion TEXT DEFAULT ''
  )`;

  await sql`CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    numero TEXT NOT NULL,
    cliente TEXT DEFAULT 'Cliente general',
    telefono TEXT DEFAULT '',
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    anticipo NUMERIC(10,2) NOT NULL DEFAULT 0,
    saldo NUMERIC(10,2) NOT NULL DEFAULT 0,
    pagado INTEGER NOT NULL DEFAULT 0,
    fecha_pago TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    observaciones TEXT DEFAULT '',
    usuario_id INTEGER,
    fecha TEXT NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS partidas_ticket (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    tipo_prenda_id INTEGER NOT NULL,
    modo TEXT NOT NULL DEFAULT 'kg',
    kilos NUMERIC(10,3) DEFAULT 0,
    piezas INTEGER DEFAULT 0,
    precio_kg NUMERIC(10,2) DEFAULT 0,
    precio_pieza NUMERIC(10,2) DEFAULT 0,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0
  )`;

  await sql`CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    monto NUMERIC(10,2) NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'anticipo',
    fecha TEXT NOT NULL,
    usuario_id INTEGER
  )`;

  console.log('Tablas creadas.');

  // Seed: verificar si ya hay usuarios
  const countResult = await sql`SELECT COUNT(*) as c FROM usuarios`;
  if (Number(countResult[0].c) > 0) {
    console.log('Ya existen datos, omitiendo seed.');
    await migrarDatosExistentes(sql);
    return;
  }

  console.log('Insertando seed...');

  await sql`INSERT INTO usuarios (usuario, nombre, password, rol)
            VALUES (${`admin`}, ${'Administrador'}, ${bcrypt.hashSync('admin123', 10)}, ${'admin'})`;
  await sql`INSERT INTO usuarios (usuario, nombre, password, rol)
            VALUES (${'empleado1'}, ${'María López'}, ${bcrypt.hashSync('empleado123', 10)}, ${'empleado'})`;

  const prendas = [
    ['Ropa Blanca',   25.00, 0, 'kg', 'Playeras, calcetines, ropa de algodón blanco'],
    ['Ropa de Color', 22.00, 0, 'kg', 'Playeras, pantalones de tela de colores'],
    ['Mezclilla',     28.00, 0, 'kg', 'Jeans, pantalones y chamarras de mezclilla'],
    ['Sábanas',       30.00, 0, 'kg', 'Sábanas individuales, matrimoniales y queen'],
    ['Cobijas',       35.00, 0, 'kg', 'Cobijas, colchas y edredones'],
    ['Ropa Delicada', 45.00, 0, 'kg', 'Blusas de seda, ropa de bebé, prendas finas'],
    ['Toallas',       20.00, 0, 'kg', 'Toallas de baño y toallas de manos'],
    ['Manteles',      32.00, 0, 'kg', 'Manteles de tela y servilletas'],
  ];

  for (const [nombre, precio_kg, precio_pieza, modo_cobro, descripcion] of prendas) {
    await sql`INSERT INTO tipos_prenda (nombre, precio_kg, precio_pieza, modo_cobro, descripcion)
              VALUES (${nombre}, ${precio_kg}, ${precio_pieza}, ${modo_cobro}, ${descripcion})`;
  }

  console.log('Seed insertado: 2 usuarios, 8 tipos de prenda.');
  await migrarDatosExistentes(sql);
}

async function migrarDatosExistentes(sql) {
  const jsonPath = path.join(__dirname, '..', 'database', 'lavamax.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No se encontró lavamax.json, omitiendo migración de datos.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  if (data.tickets && data.tickets.length > 0) {
    const countResult = await sql`SELECT COUNT(*) as c FROM tickets`;
    if (Number(countResult[0].c) > 0) {
      console.log('Ya hay tickets en la DB, omitiendo migración de tickets.');
      return;
    }

    console.log(`Migrando ${data.tickets.length} tickets...`);
    for (const t of data.tickets) {
      const saldo = t.pagado ? 0 : t.total;
      await sql`INSERT INTO tickets (numero, cliente, telefono, total, anticipo, saldo, pagado, fecha_pago, estado, observaciones, usuario_id, fecha)
                VALUES (${t.numero}, ${t.cliente || 'Cliente general'}, ${t.telefono || ''}, ${t.total}, ${0}, ${saldo}, ${t.pagado}, ${t.fecha_pago || null}, ${t.estado}, ${t.observaciones || ''}, ${t.usuario_id}, ${t.fecha})`;
    }

    if (data.partidas_ticket) {
      console.log(`Migrando ${data.partidas_ticket.length} partidas...`);
      for (const p of data.partidas_ticket) {
        await sql`INSERT INTO partidas_ticket (ticket_id, tipo_prenda_id, modo, kilos, piezas, precio_kg, precio_pieza, subtotal)
                  VALUES (${p.ticket_id}, ${p.tipo_prenda_id}, ${'kg'}, ${p.kilos}, ${0}, ${p.precio_kg}, ${0}, ${p.subtotal})`;
      }
    }

    console.log('Migración de datos completada.');
  } else {
    console.log('No hay tickets para migrar.');
  }
}

migrate().then(() => {
  console.log('Migración finalizada.');
  process.exit(0);
}).catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
