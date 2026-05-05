const { getSQL } = require('../../../lib/db');
const { withAuth } = require('../../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const id = parseInt(req.query.id);
  const { monto } = req.body;
  if (!monto || parseFloat(monto) <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const sql = getSQL();
  const fecha = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ');

  const rows = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  const ticket = rows[0];
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });

  const nuevoAnticipo = parseFloat((Number(ticket.anticipo) + parseFloat(monto)).toFixed(2));
  const nuevoSaldo = parseFloat((Number(ticket.total) - nuevoAnticipo).toFixed(2));
  const pagado = nuevoSaldo <= 0 ? 1 : 0;

  await sql`UPDATE tickets SET anticipo = ${nuevoAnticipo}, saldo = ${Math.max(0, nuevoSaldo)}, pagado = ${pagado}, fecha_pago = ${pagado ? fecha : ticket.fecha_pago} WHERE id = ${id}`;

  await sql`INSERT INTO pagos (ticket_id, monto, tipo, fecha, usuario_id)
    VALUES (${id}, ${parseFloat(monto)}, ${'abono'}, ${fecha}, ${req.user.id})`;

  res.json({ ok: true, anticipo: nuevoAnticipo, saldo: Math.max(0, nuevoSaldo), pagado });
});
