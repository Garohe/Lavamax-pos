const bcrypt = require('bcryptjs');
const { getSQL } = require('../lib/db');
const { signToken } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { usuario, password } = req.body;
  const sql = getSQL();
  const rows = await sql`SELECT * FROM usuarios WHERE usuario = ${usuario}`;
  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
  }

  const token = signToken({ id: user.id, nombre: user.nombre, rol: user.rol });
  res.json({ ok: true, nombre: user.nombre, rol: user.rol, token });
};
