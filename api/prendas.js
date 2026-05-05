const { getSQL } = require('../lib/db');
const { withAuth, withAdmin } = require('../lib/auth');

async function handleGet(req, res) {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM tipos_prenda ORDER BY nombre`;
  res.json(rows);
}

async function handlePost(req, res) {
  const { nombre, precio_kg, precio_pieza, modo_cobro, descripcion } = req.body;
  const sql = getSQL();
  const rows = await sql`INSERT INTO tipos_prenda (nombre, precio_kg, precio_pieza, modo_cobro, descripcion)
    VALUES (${nombre}, ${parseFloat(precio_kg)}, ${parseFloat(precio_pieza || 0)}, ${modo_cobro || 'kg'}, ${descripcion || ''})
    RETURNING *`;
  res.json(rows[0]);
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return withAuth(handleGet)(req, res);
  if (req.method === 'POST') return withAdmin(handlePost)(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
