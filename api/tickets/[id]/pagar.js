const { getSQL } = require('../../../lib/db');
const { withAuth } = require('../../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const id = parseInt(req.query.id);
  const sql = getSQL();
  const fecha = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ');

  const rows = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  const ticket = rows[0];
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });

  const montoRestante = parseFloat((Number(ticket.total) - Number(ticket.anticipo)).toFixed(2));

  await sql`UPDATE tickets SET pagado = 1, fecha_pago = ${fecha}, anticipo = total, saldo = 0 WHERE id = ${id}`;

  if (montoRestante > 0) {
    await sql`INSERT INTO pagos (ticket_id, monto, tipo, fecha, usuario_id)
      VALUES (${id}, ${montoRestante}, ${'liquidacion'}, ${fecha}, ${req.user.id})`;
  }

  res.json({ ok: true });
});
