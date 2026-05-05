const { getSQL } = require('../../lib/db');
const { withAuth } = require('../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = getSQL();
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });

  const ticketsHoy = await sql`SELECT * FROM tickets WHERE substring(fecha from 1 for 10) = ${hoy}`;

  const total_tickets = ticketsHoy.length;
  const total_ventas = ticketsHoy.reduce((s, t) => s + Number(t.total), 0);
  const cobrado = ticketsHoy.filter(t => t.pagado).reduce((s, t) => s + Number(t.total), 0);
  const total_anticipos = ticketsHoy.reduce((s, t) => s + Number(t.anticipo || 0), 0);

  const ids = ticketsHoy.map(t => t.id);
  let porTipo = [];

  if (ids.length > 0) {
    const partidas = await sql`SELECT pt.*, tp.nombre FROM partidas_ticket pt
      LEFT JOIN tipos_prenda tp ON pt.tipo_prenda_id = tp.id
      WHERE pt.ticket_id = ANY(${ids})`;

    const agrupado = {};
    for (const p of partidas) {
      if (!agrupado[p.nombre]) agrupado[p.nombre] = { nombre: p.nombre, kilos: 0, piezas: 0, subtotal: 0 };
      agrupado[p.nombre].kilos += Number(p.kilos) || 0;
      agrupado[p.nombre].piezas += Number(p.piezas) || 0;
      agrupado[p.nombre].subtotal += Number(p.subtotal);
    }
    porTipo = Object.values(agrupado).sort((a, b) => b.subtotal - a.subtotal);
  }

  res.json({ total_tickets, total_ventas, cobrado, total_anticipos, porTipo });
});
