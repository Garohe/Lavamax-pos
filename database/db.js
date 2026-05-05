const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'lavamax.json'));
const db = low(adapter);

// Estructura inicial
db.defaults({
  usuarios: [],
  tipos_prenda: [],
  tickets: [],
  partidas_ticket: [],
  seq: { usuarios: 0, prendas: 0, tickets: 0, partidas: 0 }
}).write();

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextId(coleccion) {
  const val = db.get(`seq.${coleccion}`).value() + 1;
  db.set(`seq.${coleccion}`, val).write();
  return val;
}

// Seed inicial solo si está vacío
if (db.get('usuarios').size().value() === 0) {
  db.get('usuarios').push({
    id: nextId('usuarios'),
    usuario: 'admin',
    nombre: 'Administrador',
    password: bcrypt.hashSync('admin123', 10),
    rol: 'admin'
  }).write();

  db.get('usuarios').push({
    id: nextId('usuarios'),
    usuario: 'empleado1',
    nombre: 'María López',
    password: bcrypt.hashSync('empleado123', 10),
    rol: 'empleado'
  }).write();

  const prendas = [
    { nombre: 'Ropa Blanca',   precio_kg: 25.00, descripcion: 'Playeras, calcetines, ropa de algodón blanco' },
    { nombre: 'Ropa de Color', precio_kg: 22.00, descripcion: 'Playeras, pantalones de tela de colores' },
    { nombre: 'Mezclilla',     precio_kg: 28.00, descripcion: 'Jeans, pantalones y chamarras de mezclilla' },
    { nombre: 'Sábanas',       precio_kg: 30.00, descripcion: 'Sábanas individuales, matrimoniales y queen' },
    { nombre: 'Cobijas',       precio_kg: 35.00, descripcion: 'Cobijas, colchas y edredones' },
    { nombre: 'Ropa Delicada', precio_kg: 45.00, descripcion: 'Blusas de seda, ropa de bebé, prendas finas' },
    { nombre: 'Toallas',       precio_kg: 20.00, descripcion: 'Toallas de baño y toallas de manos' },
    { nombre: 'Manteles',      precio_kg: 32.00, descripcion: 'Manteles de tela y servilletas' },
  ];
  prendas.forEach(p => {
    db.get('tipos_prenda').push({ id: nextId('prendas'), ...p }).write();
  });
}

module.exports = { db, nextId };
