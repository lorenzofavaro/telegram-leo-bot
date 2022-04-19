process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const { PythonShell } = require('python-shell');
const request = require('request');

const config = require('data/config.json');
const bot = new TelegramBot(config.botToken, { polling: true });
const imgbbBaseUrl = 'https://api.imgbb.com/1/upload?key=' + config.imgbbToken;
const allowedIds = config.allowedIds;

const regLinkId = /R[A-Z0-9]{11,17}/;
const regLinkDomain = /AMAZON.([A-Z]+)\//;

var answerCallbacks = {};
var callbacks = {};
var updating = false;
var updateTimer = 1800000; // 30 minutes
var lastUpdate = 'Never';

const main_kb = {
    inline_keyboard: [
        [{
            text: "Correct link ✍️",
            callback_data: 'correct_link'
        }],
        [{
            text: "Image ➡ Link",
            callback_data: 'image_link'
        }],
        [{
            text: "Publish 🚀",
            callback_data: 'publish'
        }]
    ]
};

const undo_kb = {
    inline_keyboard: [
        [{
            text: "Exit 🔴",
            callback_data: 'exit'
        }]
    ]
};

const got_link_kb = {
    inline_keyboard: [
        [{
            text: "Another image 📷",
            callback_data: 'image_link'
        }],
        [{
            text: "Home 🏠",
            callback_data: 'exit'
        }]
    ]
};

const corrected_kb = {
    inline_keyboard: [
        [{
            text: "Another link ✍️",
            callback_data: 'correct_link'
        }],
        [{
            text: "Home 🏠",
            callback_data: 'exit'
        }]
    ]
};

const publish_kb = {
    inline_keyboard: [
        [{
            text: "Single update ⬇️",
            callback_data: 'single_update'
        }],
        [{
            text: "Constant update 🔁",
            callback_data: 'constant_update'
        }],
        [{
            text: "Home 🏠",
            callback_data: 'exit'
        }]
    ]
};

const single_update_loading_kb = {
    inline_keyboard: [
        [{
            text: "Loading...",
            callback_data: 'loading'
        }],
        [{
            text: "Constant update 🔁",
            callback_data: 'constant_update'
        }],
        [{
            text: "Home 🏠",
            callback_data: 'exit'
        }]
    ]
};

const switch_off_kb = {
    inline_keyboard: [
        [{
            text: "Disable 🔴",
            callback_data: 'timer_off'
        }],
        [{
            text: "Back ⬅️",
            callback_data: 'publish'
        }]
    ]
}

const switch_on_kb = {
    inline_keyboard: [
        [{
            text: "Enable 🟢",
            callback_data: 'timer_on'
        }],
        [{
            text: "Back ⬅️",
            callback_data: 'publish'
        }]
    ]
}

bot.onText(/\/removeCatalogue/, async function (msg) {
    PythonShell.run('updater/update.py', {
        args: ['remove_catalogue']
    }, function (err) {
        if (err) {
            if (err) bot.sendMessage(msg.chat.id, "Catalogue removal not performed due to an error:\n\n" + err);
        } else {
            bot.sendMessage(msg.chat.id, "Catalogue removed");
        }
    });
});

function correctLink(message) {
    let chatId = message.chat.id;

    bot.editMessageText("<b>Send me the link of the review to be corrected</b>", {
        message_id: message.message_id,
        chat_id: chatId,
        reply_markup: undo_kb,
        parse_mode: 'HTML'
    }).then(function (thisMess) {
        answerCallbacks[chatId] = function (answer) {

            let opts = {
                reply_markup: corrected_kb,
                parse_mode: "HTML"
            };

            let review = answer.text ? answer.text.toUpperCase() : undefined;
            if (review && review.match(regLinkId) && review.match(regLinkDomain)) {
                let id = review.match(regLinkId)[0];
                let domain = review.match(regLinkDomain)[1].toLowerCase();

                review = `https://www.amazon.${domain}/review/${id}`;

                bot.deleteMessage(chatId, thisMess.message_id);
                bot.sendMessage(chatId, "<b>Permanent link</b>:\n<code>" + review + "</code>", { parse_mode: "HTML" }).then(() => {
                    bot.sendMessage(chatId, "<b>What do you want to do?</b>", opts);
                });

            } else {
                bot.sendMessage(chatId, "<b>Invalid review format.</b>", opts);
            }
        };
    });
}

function getPhotoLinkApi(photoId, callback) {
    bot.getFileLink(photoId).then(link => {

        let img_req = `${imgbbBaseUrl}&image=${link}`;
        request(img_req, {
            json: true
        }, (err, _res, body) => {
            if (err) {
                return callback(false);
            }

            return callback(body.data.url);
        });
    });
}

function imageToLink(message) {
    let chatId = message.chat.id;
    let opts = {
        reply_markup: undo_kb,
        disable_web_page_preview: true,
        parse_mode: "HTML"
    }

    bot.editMessageText("<b>Send me the image 📷 and I'll turn it into a link</b> 🔗", {
        message_id: message.message_id,
        chat_id: chatId,
        reply_markup: undo_kb,
        parse_mode: 'HTML'
    }).then(function (thisMess) {
        answerCallbacks[chatId] = function (answer) {
            bot.deleteMessage(message.chat.id, thisMess.message_id);
            opts.reply_markup = got_link_kb;

            if (answer.photo || (answer.document && answer.document.mime_type.startsWith('image'))) {
                let photoId = answer.photo ? answer.photo[answer.photo.length - 1].file_id : answer.document.file_id;
                getPhotoLinkApi(photoId, link => {
                    bot.sendMessage(chatId, "<b>Correct link</b>:\n<code>" + link + "</code>", opts);
                })
            } else {
                bot.sendMessage(chatId, "<b>Incorrect image format.</b>", opts);
            }
        };
    });
}

function publishWelcome(chatId) {
    let opts = { reply_markup: main_kb, parse_mode: "HTML" };
    bot.sendMessage(chatId, "🤖 <b>OPERATIONAL LEOBOT</b> 🤖\n\nHow I can help you?", opts);
}

function publishMenu(message) {
    let chatId = message.chat.id;

    bot.editMessageText("<b>Publications menu</b>", {
        message_id: message.message_id,
        chat_id: chatId,
        reply_markup: publish_kb,
        parse_mode: 'HTML'
    });
}

function singleUpdate(msg) {

    delete callbacks[msg.from.id];
    bot.editMessageReplyMarkup(single_update_loading_kb, { message_id: msg.message.message_id, chat_id: msg.from.id });
    PythonShell.run('updater/update.py', { args: ['update'] }, function (err) {
        if (err) {
            bot.sendMessage(myChatId, "Single update aborted due to an error:\n\n" + err);
        }
        bot.editMessageReplyMarkup(publish_kb, { message_id: msg.message.message_id, chat_id: msg.from.id });
        bot.answerCallbackQuery(msg.id, { text: "Update finished ✅", show_alert: true });

        lastUpdate = getCurrentDateTime();

    });
}

// Convert milliseconds to minutes and seconds
function millisToMinutes(millis) {
    var minutes = Math.floor(millis / 60000);
    return minutes + " minutes";
}

// Sleep for ms milliseconds
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function getCurrentDateTime() {
    let today = new Date();

    let dd = String(today.getDate()).padStart(2, '0');
    let MM = String(today.getMonth() + 1).padStart(2, '0');
    let yyyy = today.getFullYear();

    let hh = String(today.getHours()).padStart(2, '0');
    let mm = String(today.getMinutes()).padStart(2, '0');
    let ss = String(today.getSeconds()).padStart(2, '0');

    let currentDateTime = dd + '/' + MM + '/' + yyyy + " " + hh + ":" + mm + ":" + ss;

    return currentDateTime;
}

function constantUpdate(message) {
    let text = "<b>Timer</b>: " + millisToMinutes(updateTimer);
    text += "\n<b>Last update</b>: " + lastUpdate;

    let kb = updating ? switch_off_kb : switch_on_kb;

    bot.editMessageText(text, {
        message_id: message.message_id,
        chat_id: message.chat.id,
        reply_markup: kb,
        parse_mode: 'HTML'
    });
}

async function timerOn(message) {
    if (!updating) {
        bot.editMessageReplyMarkup(switch_off_kb, {
            message_id: message.message_id,
            chat_id: message.chat.id
        });

        updating = true;

        while (updating) {
            PythonShell.run('updater/update.py', { args: ['update'] }, function (err) {
                if (err) {
                    updating = false;
                    bot.sendMessage(myChatId, "Update aborted due to an error:\n\n" + err);
                }
            });
            lastUpdate = getCurrentDateTime();

            let today = new Date();
            if (today.getHours() < 6) { // Waiting until 6
                updateTimer = (6 - today.getHours()) * 3600000;
                await sleep(updateTimer);
                updateTimer = 0.5 * 3600000;
            } else {
                await sleep(updateTimer);
            }
        }
    } else {
        bot.deleteMessage(msg.from.id, msg.message.message_id);
    }
}

async function timerOff(message) {
    if (updating) {
        updating = false;

        bot.editMessageReplyMarkup(switch_on_kb, {
            message_id: message.message_id,
            chat_id: message.chat.id
        });
    } else {
        bot.deleteMessage(msg.from.id, msg.message.message_id);
    }
}

bot.on('callback_query', function (msg) {
    console.log(getCurrentDateTime() + " - " + msg.from.id + (msg.from.username ? " (" + msg.from.username + ")" : "") + ": " + msg.data);
    if (allowedIds.indexOf(msg.from.id) < 0) return;

    var message = msg.message ? msg.message : msg;

    if ((message.date == 0) || callbacks[message.chat.id] && callbacks[message.chat.id][0] === msg.data && message.date - callbacks[message.chat.id][1] >= 0 && message.date - callbacks[message.chat.id][1] < 5) {
        return;
    }

    callbacks[message.chat.id] = [msg.data, message.date];

    switch (msg.data) {
        case 'correct_link':
            correctLink(message);
            break;
        case 'image_link':
            imageToLink(message);
            break;
        case 'publish':
            publishMenu(message);
            break;
        case 'single_update':
            singleUpdate(msg);
            break;
        case 'constant_update':
            constantUpdate(message);
            break;
        case 'timer_on':
            timerOn(message);
            break;
        case 'timer_off':
            timerOff(message);
            break;
        case 'exit':
            answerCallbacks[message.chat.id] = function (answer) { };
            bot.deleteMessage(message.chat.id, message.message_id);

            publishWelcome(message.chat.id);
            break;
    }
});

// Generic message
bot.on('message', function (msg) {
    console.log(getCurrentDateTime() + " - " + msg.chat.id + (msg.from.username ? " (" + msg.from.username + ")" : "") + ": " + msg.text);
    if (msg.photo) {
        bot.getFileLink(msg.photo[msg.photo.length - 1].file_id).then(link => {
            console.log(link);
        });
    }
    if (allowedIds.indexOf(msg.from.id) < 0) return;

    var callback = answerCallbacks[msg.chat.id];
    if (callback) {
        delete answerCallbacks[msg.chat.id];
        return callback(msg);
    }
});

bot.onText(/\/start/, (msg) => {
    if (allowedIds.indexOf(msg.from.id) < 0) return;

    publishWelcome(msg.chat.id);
});

// Output error
bot.on("polling_error", console.log);