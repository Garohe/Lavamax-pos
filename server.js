const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { db, nextId } = require('./database/db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'lavamax-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

function auth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'No autorizado' });
}

function soloAdmin(req, res, next) {
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Sin permiso' });
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;
  const user = db.get('usuarios').find({ usuario }).value();
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
  req.session.userId = user.id;
  req.session.nombre = user.nombre;
  req.session.rol    = user.rol;
  res.json({ ok: true, nombre: user.nombre, rol: user.rol });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ autenticado: false });
  res.json({ autenticado: true, nombre: req.session.nombre, rol: req.session.rol });
});

// ── Tipos de prenda ───────────────────────────────────────────────────────────
app.get('/api/prendas', auth, (req, res) => {
  const prendas = db.get('tipos_prenda').sortBy('nombre').value();
  res.json(prendas);
});

app.post('/api/prendas', auth, soloAdmin, (req, res) => {
  const { nombre, precio_kg, descripcion } = req.body;
  const nueva = { id: nextId('prendas'), nombre, precio_kg: parseFloat(precio_kg), descripcion: descripcion || '' };
  db.get('tipos_prenda').push(nueva).write();
  res.json(nueva);
});

app.put('/api/prendas/:id', auth, soloAdmin, (req, res) => {
  const { nombre, precio_kg, descripcion } = req.body;
  db.get('tipos_prenda').find({ id: parseInt(req.params.id) })
    .assign({ nombre, precio_kg: parseFloat(precio_kg), descripcion: descripcion || '' }).write();
  res.json({ ok: true });
});

// ── Tickets ───────────────────────────────────────────────────────────────────
app.get('/api/tickets', auth, (req, res) => {
  const { desde, hasta, estado } = req.query;
  let tickets = db.get('tickets').value();

  if (desde) tickets = tickets.filter(t => t.fecha.slice(0, 10) >= desde);
  if (hasta) tickets = tickets.filter(t => t.fecha.slice(0, 10) <= hasta);
  if (estado) tickets = tickets.filter(t => t.estado === estado);

  // Agregar nombre del empleado
  const usuarios = db.get('usuarios').value();
  tickets = tickets.map(t => {
    const emp = usuarios.find(u => u.id === t.usuario_id);
    return { ...t, empleado: emp ? emp.nombre : 'Desconocido' };
  });

  tickets.sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.json(tickets);
});

app.get('/api/tickets/:id', auth, (req, res) => {
  const ticket = db.get('tickets').find({ id: parseInt(req.params.id) }).value();
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });

  const emp = db.get('usuarios').find({ id: ticket.usuario_id }).value();
  const partidas = db.get('partidas_ticket').filter({ ticket_id: ticket.id }).value().map(p => {
    const prenda = db.get('tipos_prenda').find({ id: p.tipo_prenda_id }).value();
    return { ...p, tipo_nombre: prenda ? prenda.nombre : '?', precio_kg: prenda ? prenda.precio_kg : 0 };
  });

  res.json({ ...ticket, empleado: emp ? emp.nombre : '?', partidas });
});

app.post('/api/tickets', auth, (req, res) => {
  const { cliente, telefono, partidas, observaciones } = req.body;
  if (!partidas || partidas.length === 0) return res.status(400).json({ error: 'Sin partidas' });

  let total = 0;
  const lineas = partidas.map(p => {
    const prenda = db.get('tipos_prenda').find({ id: parseInt(p.tipo_prenda_id) }).value();
    if (!prenda) throw new Error('Prenda no encontrada');
    const subtotal = parseFloat((parseFloat(p.kilos) * prenda.precio_kg).toFixed(2));
    total += subtotal;
    return { tipo_prenda_id: prenda.id, kilos: parseFloat(p.kilos), precio_kg: prenda.precio_kg, subtotal };
  });
  total = parseFloat(total.toFixed(2));

  const numero = generarNumero();
  const ticketId = nextId('tickets');
  const nuevoTicket = {
    id: ticketId,
    numero,
    cliente: cliente || 'Cliente general',
    telefono: telefono || '',
    total,
    pagado: 0,
    fecha_pago: null,
    estado: 'pendiente',
    observaciones: observaciones || '',
    usuario_id: req.session.userId,
    fecha: new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ')
  };
  db.get('tickets').push(nuevoTicket).write();

  lineas.forEach(l => {
    db.get('partidas_ticket').push({ id: nextId('partidas'), ticket_id: ticketId, ...l }).write();
  });

  res.json({ ok: true, id: ticketId, numero, total });
});

app.patch('/api/tickets/:id/estado', auth, (req, res) => {
  const { estado } = req.body;
  const validos = ['pendiente', 'en_proceso', 'listo', 'entregado'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  db.get('tickets').find({ id: parseInt(req.params.id) }).assign({ estado }).write();
  res.json({ ok: true });
});

app.patch('/api/tickets/:id/pagar', auth, (req, res) => {
  const fecha_pago = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ');
  db.get('tickets').find({ id: parseInt(req.params.id) }).assign({ pagado: 1, fecha_pago }).write();
  res.json({ ok: true });
});

// ── Reportes ──────────────────────────────────────────────────────────────────
app.get('/api/reporte/hoy', auth, (req, res) => {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
  const ticketsHoy = db.get('tickets').filter(t => t.fecha.startsWith(hoy)).value();

  const total_tickets = ticketsHoy.length;
  const total_ventas  = ticketsHoy.reduce((s, t) => s + t.total, 0);
  const cobrado       = ticketsHoy.filter(t => t.pagado).reduce((s, t) => s + t.total, 0);

  // Por tipo de prenda
  const prendas = db.get('tipos_prenda').value();
  const ids = ticketsHoy.map(t => t.id);
  const partidas = db.get('partidas_ticket').filter(p => ids.includes(p.ticket_id)).value();

  const porTipo = prendas.map(pr => {
    const lineas = partidas.filter(p => p.tipo_prenda_id === pr.id);
    if (!lineas.length) return null;
    return {
      nombre: pr.nombre,
      kilos:    lineas.reduce((s, l) => s + l.kilos, 0),
      subtotal: lineas.reduce((s, l) => s + l.subtotal, 0)
    };
  }).filter(Boolean).sort((a, b) => b.subtotal - a.subtotal);

  res.json({ total_tickets, total_ventas, cobrado, porTipo });
});

app.get('/api/reporte/semana', auth, (req, res) => {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' }));
  }
  const resultado = dias.map(dia => {
    const t = db.get('tickets').filter(tk => tk.fecha.startsWith(dia)).value();
    return { dia, tickets: t.length, ventas: t.reduce((s, tk) => s + tk.total, 0) };
  }).filter(d => d.tickets > 0).reverse();

  res.json(resultado);
});

// ── Usuarios ──────────────────────────────────────────────────────────────────
app.get('/api/usuarios', auth, soloAdmin, (req, res) => {
  const usuarios = db.get('usuarios').map(u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol })).sortBy('nombre').value();
  res.json(usuarios);
});

app.post('/api/usuarios', auth, soloAdmin, (req, res) => {
  const { usuario, nombre, password, rol } = req.body;
  const existe = db.get('usuarios').find({ usuario }).value();
  if (existe) return res.status(400).json({ error: 'Usuario ya existe' });
  const nuevo = { id: nextId('usuarios'), usuario, nombre, password: bcrypt.hashSync(password, 10), rol: rol || 'empleado' };
  db.get('usuarios').push(nuevo).write();
  res.json({ id: nuevo.id, usuario, nombre, rol: nuevo.rol });
});

// ── Helper ────────────────────────────────────────────────────────────────────
function generarNumero() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `LV${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${Date.now().toString().slice(-5)}`;
}

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ✅  LAVAMAX POS corriendo              ║');
  console.log(`║   🌐  http://localhost:${PORT}              ║`);
  console.log('║                                          ║');
  console.log('║   👤  admin      → admin123              ║');
  console.log('║   👤  empleado1  → empleado123           ║');
  console.log('╚══════════════════════════════════════════╝\n');
});
