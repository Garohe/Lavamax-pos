const { getSQL } = require('../../lib/db');
const { withAuth } = require('../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = parseInt(req.query.id);
  const sql = getSQL();

  const ticketRows = await sql`SELECT t.*, u.nombre as empleado FROM tickets t LEFT JOIN usuarios u ON t.usuario_id = u.id WHERE t.id = ${id}`;
  const ticket = ticketRows[0];
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });

  const partidas = await sql`SELECT pt.*, tp.nombre as tipo_nombre FROM partidas_ticket pt LEFT JOIN tipos_prenda tp ON pt.tipo_prenda_id = tp.id WHERE pt.ticket_id = ${id}`;

  const pagos = await sql`SELECT p.*, u.nombre as usuario_nombre FROM pagos p LEFT JOIN usuarios u ON p.usuario_id = u.id WHERE p.ticket_id = ${id} ORDER BY p.fecha ASC`;

  res.json({ ...ticket, partidas, pagos });
});
