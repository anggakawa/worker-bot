require('dotenv').config();

const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const WizardScene = require('telegraf/scenes/wizard');
const db = require('./db');
const { enter, leave } = Stage;
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);


function connectDB() {
  db.connect((error) => {
    if (error) {
      console.log(`there's an error: ${error}`);
      return;
    }
  });
}
connectDB();

// registering user with wizard
const registerWizard = new WizardScene('register-wizard', 
  (ctx) => {
    ctx.reply('Silahkan masukkan NIK anda');
    return ctx.wizard.next();
  }, 
  ctx => {
    ctx.wizard.state.NIK = ctx.message.text;
    ctx.reply(` NIK anda adalah: ${ctx.wizard.state.NIK}, selanjutnya masukkan nomor handphone anda.\nMohon diawali dengan 628[Nomor anda]`);
    return ctx.wizard.next();
  }, 
  ctx => {
    ctx.wizard.state.phoneNumber = parseInt(ctx.message.text);
    ctx.reply(`NIK anda adalah ${ctx.wizard.state.NIK} dan nomor HP anda: ${ctx.wizard.state.phoneNumber}. Apakah benar?`, 
      Markup.keyboard(['Yes', 'No']).resize().oneTime().extra()
    );
    return ctx.wizard.next();
  },
  ctx => {
    if (ctx.message.text === 'Yes') {
      ctx.reply('Menyimpan data anda...Ketuk OK untuk melihat hasil', 
        Markup.keyboard(['OK']).resize().oneTime().extra()
      );
      ctx.wizard.next();  
    } else {
      ctx.reply('Membatalkan registrasi...');
      return ctx.scene.leave();
    }
  }, 
  ctx => {
    return new Promise((resolve, reject) => {
      db.query(`INSERT INTO data_karyawan(NIK, kode_rahasia, telegram_id) 
        VALUES (${ctx.wizard.state.NIK}, ${ctx.wizard.state.phoneNumber}, '${ctx.from.username}')`, (error, results, fields) => {
        if (error) { 
          ctx.reply('gagal');
        } else {
          ctx.reply('data berhasil disimpan');
        }
        return resolve(ctx.scene.leave());
      });
    });
  }
);

// // registering user with wizard
// const registerWizard = new WizardScene('register-wizard', 
//   (ctx) => {
//     ctx.reply('Silahkan masukkan NIK anda');
//     return ctx.wizard.next();
//   },
//   ctx => {
//     ctx.wizard.state.NIK = ctx.message.text;
//     ctx.reply('Masukkan kantor bagian anda: ', 
//       Markup.keyboard(['BJM', 'BRI', 'TTG', 'BLN', 'STI', 'PLE']).resize().oneTime().extra()
//     );
//     return ctx.wizard.next();
//   }, 
//   ctx => {
//     ctx.wizard.state.bagian = ctx.message.text;
//     ctx.reply(` NIK anda adalah: ${ctx.wizard.state.NIK} dan kantor bagian anda ${ctx.wizard.state.bagian},\nselanjutnya masukkan nomor handphone anda.\nMohon diawali dengan 08[Nomor anda] atau 62[Nomor anda]`,
//       Extra.markup((markup) => {
//         return markup.resize()
//           .keyboard([
//             markup.contactRequestButton('Send contact')
//           ])
//       })
//     );
//     return ctx.wizard.next();
//   }, 
//   ctx => {
//     ctx.wizard.state.phoneNumber = ctx.message.text || ctx.message.contact.phone_number;
//     ctx.reply(`NIK anda adalah ${ctx.wizard.state.NIK} dan nomor HP anda: ${ctx.wizard.state.phoneNumber}. Apakah benar?`, 
//       Markup.keyboard(['Yes', 'No']).resize().oneTime().extra()
//     );
//     return ctx.wizard.next();
//   },
//   ctx => {
//     if (ctx.message.text === 'Yes') {
//       ctx.reply('Menyimpan data anda...Ketuk OK untuk melihat hasil', 
//         Markup.keyboard(['OK']).resize().oneTime().extra()
//       );
//       return ctx.wizard.next();  
//     } else {
//       ctx.reply('Membatalkan registrasi...');
//       return ctx.scene.leave();
//     }
//   }, 
//   ctx => {
//     return new Promise((resolve, reject) => {
//       db.query(`INSERT INTO data_karyawan(NIK, nomor_handphone, telegram_id, nama, message_id, bagian) 
//         VALUES (${ctx.wizard.state.NIK}, ${ctx.wizard.state.phoneNumber}, '${ctx.from.username}', '${ctx.from.first_name}', ${ctx.chat.id}, '${ctx.wizard.state.bagian}')`, (error, results, fields) => {
//         if (error) { 
//           ctx.reply(`🤔 ... \n${error}`);
//         } else {
//           ctx.reply('data berhasil disimpan');
//         }
//         return resolve(ctx.scene.leave());
//       });
//     });
//   }
// );

const registerScene = new Scene('register');
registerScene.enter((ctx) => {
  // TODO: 
  // leave if there's data on database
  ctx.reply('masukkan nik dan kode rahasia anda dengan format berikut: NIK KODE-RAHASIA')
  ctx.reply(`harap untuk mengecek kembali NIK dan kode rahasia anda... \nuntuk membatalkan silahkan ketik "exit"`);
});
registerScene.leave((ctx) => ctx.reply('membatalkan transaksi...'));
registerScene.hears('exit', leave());
registerScene.on('message', (ctx) => {
  return new Promise((resolve, reject) => {
    let array = ctx.message.text.split(' ');
    if(array.length == 2) {
      resolve(array);
    } else {
      ctx.reply('harap periksa kembali format yang anda masukkan\nuntuk membatalkan transaksi ketik "exit"');
      reject('ada error');
    }
  }).then(query => {
    return db.query(`INSERT INTO data_karyawan(NIK, kode_rahasia, telegram_id) 
      VALUES (${query[0]}, ${query[1]}, '${ctx.from.username}')`, (error, results, fields) => {
        if (error) { 
          return ctx.reply(`terjadi kesalahan: ${error.message} \n\nSilahkan mengecek kembali entry anda dan harap masukkan kembali`);
        }
        ctx.reply('data berhasil disimpan');
      });
  }).catch(error => console.log(error));
});

const updateScenes = new Scene('update');
updateScenes.enter((ctx) => {
  ctx.reply(`
    menu ini digunakan untuk mengupdate atau memperbaharui data anda. 
    1. Untuk mengganti NIK silahkan ketik "NIK [nomor_baru]".
    2. Untuk mengganti kode rahasia silahkan ketik "KODE [kode_lama] [kode_baru]"
    3. Untuk mengganti id telegram silahkan ketik "GANTI-ID" 
  `);
});
updateScenes.command('test', (ctx) => {
  ctx.reply('masuk ke scene dan command');
  console.log(ctx.message.text);
});

// const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const stage = new Stage([registerScene, updateScenes, registerWizard]);
bot.use(session());
bot.use(stage.middleware());
bot.command('register', enter('register'));
bot.command('updatebaru', enter('register-wizard'));
bot.command('update', enter('update'));
bot.command('phone', ctx => ctx.replyWithContact(62, 'angga'));
bot.command('username', ctx => {console.log(ctx.from.username || ctx.from.id)});
bot.command('onetime', ({ reply }) =>
  reply('One time keyboard', Markup
    .keyboard(['/simple', '/inline', '/pyramid'])
    .oneTime()
    .resize()
    .extra()
  )
);
bot.on('message', (ctx) => ctx.reply('Try /register or /update atau /updatebaru'));

bot.startPolling(console.log('running...'));
