require('dotenv').config();

const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const WizardScene = require('telegraf/scenes/wizard');
const moment = require('moment');
const db = require('./db');

const { enter, leave } = Stage;

function connectDB() {
  db.connect((error) => {
    if (error) {
      console.log(`there's an error: ${error}`);
      return;
    }
  });
}
connectDB();

// Absen Wizard
const AbsenWizard = new WizardScene('absen-wizard', 
  (ctx) => {
    if (ctx.session.logged_in && ctx.session.absen != 1) {
      ctx.reply('Silahkan ketuk tombol Send Location', Extra.markup((markup) => {
        return markup.resize()
          .keyboard([
            markup.locationRequestButton('Send location')
          ])
      }));
      return ctx.wizard.next();
    } else if (ctx.session.absen > 0){
      ctx.reply('Anda sudah absen');
      return ctx.scene.leave();
    } else {
      ctx.reply('Anda belum login');
      return ctx.scene.leave();
    }
  }, 
  (ctx) => {
    let date = moment(new Date()).format('YYYY-MM-DD');
    ctx.session.absen = ctx.session.absen || 0; 
    ctx.wizard.state.lat = ctx.message.location.latitude;
    ctx.wizard.state.lng = ctx.message.location.longitude;
    ctx.reply('Menyimpan data anda...Ketuk OK untuk melihat hasil', 
      Markup.keyboard(['OK']).resize().oneTime().extra()
    );
    return db.query(`INSERT INTO absen_karyawan(NIK, tanggal, available, lat, lng)
    SELECT '${ctx.session.nik}', '${date}', ${true}, ${ctx.wizard.state.lat}, ${ctx.wizard.state.lng}
    FROM dual WHERE NOT EXISTS 
    (SELECT 1 FROM absen_karyawan WHERE NIK = '${ctx.session.nik}' AND tanggal = '${date}')`, (error, result) => {
      console.log(result);
        if (error) {
          ctx.reply(error);
        }
        ctx.session.absen++;
        return ctx.scene.leave();
      });
  }
);

// untuk log out
const logoutScenes = new Scene('logout');
logoutScenes.enter((ctx) => {
  ctx.reply(`Silahkan ketuk LOG-OUT untuk log out di hari ini`, 
    Markup.keyboard(['LOG-OUT', 'CANCEL']).resize().oneTime().extra()
  );
});
logoutScenes.leave((ctx) => ctx.reply('bye...'));
logoutScenes.hears('LOG-OUT', (ctx) => {
  if (ctx.session.logged_in) {
    let date = moment(new Date()).format('YYYY-MM-DD');
    ctx.reply('Terima kasih atas kerja keras anda hari ini');
    db.query(`UPDATE absen_karyawan SET available = ${false}
    WHERE NIK = '${ctx.session.nik}' AND tanggal = '${date}'`,
      (error) => {
        if (error) ctx.reply(error);
        ctx.session.absen = null;
        ctx.session.logged_in = null;
        ctx.session.nik = null;
      });
  } else {
    ctx.reply('Anda belum login');
  }
});
logoutScenes.hears('CANCEL', ctx => {
  leave();
});

// check available workers
const checkAvailability = new Scene('available');
checkAvailability.enter((ctx) => {
  if (ctx.session.logged_in) {
    let date = moment(new Date()).format('YYYY-MM-DD');
    return new Promise((resolve, reject) => {
      db.query(`SELECT data_karyawan.nomor_handphone, data_karyawan.nama, data_karyawan.bagian FROM data_karyawan INNER JOIN absen_karyawan  
      ON data_karyawan.NIK = absen_karyawan.NIK WHERE absen_karyawan.available = true AND absen_karyawan.tanggal = '${date}'
      ORDER BY data_karyawan.bagian`, (error, result) => {
          if (error) {
            ctx.reply(error);
          } else {
            if (result.length > 0) {
              result.forEach(data => {
                ctx.reply(`${data.nama} - ${data.bagian}, HP: ${data.nomor_handphone}`);
              });
            } else {
              ctx.reply('Tidak ditemukan pekerja yang tersedia');
            }
          }
          resolve();
        });
    });  
  } else {
    return ctx.reply('anda belum login');
  }
});

// login wizard scene
const loginWizardScene = new WizardScene('login', 
  ctx => {
    ctx.replyWithHTML(`Klik LOGIN untuk memulai log in`, Markup.keyboard(['LOGIN', 'CANCEL']).resize().oneTime().extra()); 
    return ctx.wizard.next();
  }, 
  ctx => {
    if (ctx.message.text === 'LOGIN') {
      return new Promise((resolve, reject) => {
        db.query(`SELECT nama, NIK FROM data_karyawan WHERE telegram_id = '${ctx.from.username}' LIMIT 1`, (error, result) => {
          if (error) {
            ctx.reply('terjadi kesalahan');
            return resolve(ctx.scene.leave());
          } else if (result.length !== 1) {
            ctx.reply('username anda tidak terdaftar, silahkan registrasi');
            return resolve(ctx.scene.leave());
          }
          ctx.reply('Silahkan klik OK untuk melanjutkan', Markup.keyboard(['OK']).resize().oneTime().extra());
          ctx.session.nik = result[0].NIK;
          ctx.session.nama = result[0].nama;
          return resolve(ctx.wizard.next());
        });
      });
    } else {
      ctx.scene.leave();
    }
  }, 
  ctx => {
    ctx.session.logged_in = true;
    ctx.replyWithHTML(`Anda berhasil masuk, selamat datang <b>${ctx.session.nama}</b>`);
    return ctx.scene.leave();
  }
);

// registering user with wizard
const registerWizard = new WizardScene('register-wizard', 
  (ctx) => {
    ctx.reply('Silahkan masukkan NIK anda');
    return ctx.wizard.next();
  },
  ctx => {
    ctx.wizard.state.NIK = ctx.message.text;
    ctx.wizard.state.username = ctx.from.username;
    ctx.replyWithHTML(`NIK anda adalah ${ctx.wizard.state.NIK} dan username telegram anda: @${ctx.wizard.state.username}. Apakah benar?\n\n<i>Harap diperhatikan bahwa NIK anda akan kami sambungkan dengan telegram anda dan tidak akan dirubah</i>`, 
      Markup.keyboard(['Yes', 'No']).resize().oneTime().extra()
    );
    return ctx.wizard.next();
  },
  ctx => {
    if (ctx.message.text === 'Yes') {
      ctx.reply('Menyimpan data anda...Ketuk OK untuk melihat hasil', 
        Markup.keyboard(['OK']).resize().oneTime().extra()
      );
      return ctx.wizard.next();  
    } else {
      ctx.reply('Membatalkan registrasi...');
      return ctx.scene.leave();
    }
  }, 
  ctx => {
    return new Promise((resolve, reject) => {
      db.query(`UPDATE data_karyawan SET telegram_id = '${ctx.wizard.state.username}' 
        WHERE NIK = '${ctx.wizard.state.NIK}'`, (error, results, fields) => {
        if (error) { 
          ctx.reply(`🤔 ... \n${error}`);
        } else {
          ctx.reply('data berhasil disimpan');
        }
        return resolve(ctx.scene.leave());
      });
    });
  }
);

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const stage = new Stage([logoutScenes, checkAvailability, loginWizardScene, AbsenWizard, registerWizard], { ttl: 60 });
bot.use(session());
bot.use(stage.middleware());
// use it for logging the message type
// bot.use(ctx => {
//   console.log(ctx.message);
// })
// bot.command('register', enter('register-wizard'));
bot.command('absen', enter('absen-wizard'));
bot.command('logout', enter('logout'));
bot.command('available', enter('available'));
bot.command('login', enter('login'));
bot.command('register', enter('register-wizard'));
bot.command('special', (ctx) => {
  return ctx.reply('Special buttons keyboard', Extra.markup((markup) => {
    return markup.resize()
      .keyboard([
        markup.contactRequestButton('Send contact'),
        markup.locationRequestButton('Send location')
      ])
  }))
});
bot.on('message', (ctx) => ctx.reply(`Hello, selamat datang 😃. Silahkan masukkan perintah:
  1. /login untuk melakukan login.
  2. /absen untuk absensi.
  3. /logout untuk logout.
  4. /available untuk melihat siapa saja yang tersedia.
`));
bot.startPolling(console.log('running...'));
