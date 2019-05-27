const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost', 
  user: 'root', 
  password: '', 
  database: 'ccan-absensi'
}); 

module.exports = connection;

