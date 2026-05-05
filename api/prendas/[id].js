const { getSQL } = require('../../lib/db');
const { withAdmin } = require('../../lib/auth');

module.exports = withAdmin(async (req, res) => {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const id = parseInt(req.query.id);
  const { nombre, precio_kg, precio_pieza, modo_cobro, descripcion } = req.body;
  const sql = getSQL();

  await sql`UPDATE tipos_prenda SET nombre = ${nombre}, precio_kg = ${parseFloat(precio_kg)}, precio_pieza = ${parseFloat(precio_pieza || 0)}, modo_cobro = ${modo_cobro || 'kg'}, descripcion = ${descripcion || ''} WHERE id = ${id}`;

  res.json({ ok: true });
});
