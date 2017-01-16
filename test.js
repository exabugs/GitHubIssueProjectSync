// For Local Test
// Node.js 4.3.2
const lambda = require("./lambda");

process.env.token = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// 下記 X-Hub-Signature の値 sha1= は、GitHub の
const event = {
  headers: {
    'X-Hub-Signature': 'sha1=127ad3ca94f4e3520fb30fb18b6d36d0b6de28d'
  },
  body: JSON.stringify(require("./payload.json"))
};

const context = {
  succeed: response => {
    console.log(response);
  },
  fail: e => {
    console.log(response);
  }
};

// Lambda 実行
lambda.handler(event, context);
