const { getSQL } = require('../lib/db');
const { withAuth } = require('../lib/auth');

function generarNumero() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `LV${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${Date.now().toString().slice(-5)}`;
}

async function handleGet(req, res) {
  const { desde, hasta, estado } = req.query;
  const sql = getSQL();

  // Build query with conditional filters
  let rows;
  if (desde && hasta && estado) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) >= ${desde} AND substring(t.fecha from 1 for 10) <= ${hasta} AND t.estado = ${estado} ORDER BY t.fecha DESC`;
  } else if (desde && hasta) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) >= ${desde} AND substring(t.fecha from 1 for 10) <= ${hasta} ORDER BY t.fecha DESC`;
  } else if (desde && estado) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) >= ${desde} AND t.estado = ${estado} ORDER BY t.fecha DESC`;
  } else if (hasta && estado) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) <= ${hasta} AND t.estado = ${estado} ORDER BY t.fecha DESC`;
  } else if (desde) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) >= ${desde} ORDER BY t.fecha DESC`;
  } else if (hasta) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE substring(t.fecha from 1 for 10) <= ${hasta} ORDER BY t.fecha DESC`;
  } else if (estado) {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE t.estado = ${estado} ORDER BY t.fecha DESC`;
  } else {
    rows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id ORDER BY t.fecha DESC`;
  }

  res.json(rows);
}

async function handlePost(req, res) {
  const { cliente, telefono, partidas, observaciones, anticipo } = req.body;
  if (!partidas || partidas.length === 0) return res.status(400).json({ error: 'Sin partidas' });

  const sql = getSQL();
  let total = 0;
  const lineas = [];

  for (const p of partidas) {
    const prendaRows = await sql`SELECT * FROM tipos_prenda WHERE id = ${parseInt(p.tipo_prenda_id)}`;
    const prenda = prendaRows[0];
    if (!prenda) return res.status(400).json({ error: 'Prenda no encontrada' });

    const modo = p.modo || 'kg';
    let subtotal = 0;
    if (modo === 'pieza') {
      subtotal = parseFloat(((parseInt(p.piezas) || 0) * Number(prenda.precio_pieza)).toFixed(2));
    } else {
      subtotal = parseFloat(((parseFloat(p.kilos) || 0) * Number(prenda.precio_kg)).toFixed(2));
    }
    total += subtotal;
    lineas.push({
      tipo_prenda_id: prenda.id,
      modo,
      kilos: parseFloat(p.kilos) || 0,
      piezas: parseInt(p.piezas) || 0,
      precio_kg: Number(prenda.precio_kg),
      precio_pieza: Number(prenda.precio_pieza),
      subtotal,
    });
  }

  total = parseFloat(total.toFixed(2));
  const anticipoVal = parseFloat(anticipo) || 0;
  const saldo = parseFloat((total - anticipoVal).toFixed(2));
  const pagado = saldo <= 0 ? 1 : 0;
  const numero = generarNumero();
  const fecha = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ');

  const ticketRows = await sql`INSERT INTO tickets (numero, cliente, telefono, total, anticipo, saldo, pagado, fecha_pago, estado, observaciones, usuario_id, fecha)
    VALUES (${numero}, ${cliente || 'Cliente general'}, ${telefono || ''}, ${total}, ${anticipoVal}, ${saldo}, ${pagado}, ${pagado ? fecha : null}, ${'pendiente'}, ${observaciones || ''}, ${req.user.id}, ${fecha})
    RETURNING id`;

  const ticketId = ticketRows[0].id;

  for (const l of lineas) {
    await sql`INSERT INTO partidas_ticket (ticket_id, tipo_prenda_id, modo, kilos, piezas, precio_kg, precio_pieza, subtotal)
      VALUES (${ticketId}, ${l.tipo_prenda_id}, ${l.modo}, ${l.kilos}, ${l.piezas}, ${l.precio_kg}, ${l.precio_pieza}, ${l.subtotal})`;
  }

  if (anticipoVal > 0) {
    await sql`INSERT INTO pagos (ticket_id, monto, tipo, fecha, usuario_id)
      VALUES (${ticketId}, ${anticipoVal}, ${'anticipo'}, ${fecha}, ${req.user.id})`;
  }

  res.json({ ok: true, id: ticketId, numero, total, anticipo: anticipoVal, saldo });
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return withAuth(handleGet)(req, res);
  if (req.method === 'POST') return withAuth(handlePost)(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
