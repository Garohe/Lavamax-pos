const { getSQL } = require('../../../lib/db');
const { withAuth } = require('../../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const id = parseInt(req.query.id);
  const { estado } = req.body;
  const validos = ['pendiente', 'en_proceso', 'listo', 'entregado'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  const sql = getSQL();
  await sql`UPDATE tickets SET estado = ${estado} WHERE id = ${id}`;
  res.json({ ok: true });
});
