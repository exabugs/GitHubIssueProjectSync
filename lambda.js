'use strict';

const crypto = require('crypto');
const https = require('https');

exports.handler = function(event, context) {

  console.log(JSON.stringify(event));
  console.log(JSON.stringify(event.headers));
  const headers = event.headers;

  // 認証
  const hmac = crypto.createHmac('sha1', process.env.token);
  hmac.update(event.body, 'utf8');
  const calculatedSignature = 'sha1=' + hmac.digest('hex');

  if (headers['X-Hub-Signature'] !== calculatedSignature) {
    console.log(`calculatedSignature : ${calculatedSignature}`);
    console.log(`req.X-Hub-Signature : ${headers['X-Hub-Signature']}`);
    return context.succeed({statusCode: 403});
  }

  const payload = JSON.parse(event.body);

  const REPO = payload.repository;
  if (!REPO) {
    console.log('Not exists Repository.');
    return context.succeed({statusCode: 200});
  }
  const REPO_OWNER = REPO.owner.login;
  const REPO_NAME = REPO.name;
  console.log(`REPOSITORY_OWNER : ${REPO_OWNER}`);
  console.log(`REPOSITORY_NAME : ${REPO_NAME}`);

  const ISSUE = payload.issue;
  if (!ISSUE) {
    console.log('Not exists Issue.');
    return context.succeed({statusCode: 200});
  }
  const ISSUE_STATE = ISSUE.state;
  const ISSUE_TITLE = ISSUE.title;
  const ISSUE_ID = ISSUE.id;
  const ISSUE_URL = ISSUE.url;
  console.log(`ISSUE_STATE : ${ISSUE_STATE}`);
  console.log(`ISSUE_TITLE : ${ISSUE_TITLE}`);
  console.log(`ISSUE_ID : ${ISSUE_ID}`);
  console.log(`ISSUE_URL : ${ISSUE_URL}`);

  const MILESTONE = ISSUE.milestone;
  if (!MILESTONE) {
    console.log('This issue is not assinged to milestone.');
    return context.succeed({statusCode: 200});
  }
  const MILESTONE_TITLE = MILESTONE.title;
  const MILESTONE_ID = MILESTONE.id;
  const MILESTONE_URL = MILESTONE.html_url;
  console.log(`MILESTONE_TITLE : ${MILESTONE_TITLE}`);
  console.log(`MILESTONE_ID : ${MILESTONE_ID}`);
  console.log(`MILESTONE_URL : ${MILESTONE_URL}`);

  request('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/projects`).then(data => {
    console.log('Stage 1');
    return data.filter((milestone) => {
      // Description を編集できるように、最終行にIDが含まれていればよいことにする。
      if (!milestone.body) return false;
      const body = milestone.body.split('\n');
      return body[body.length - 1].indexOf(MILESTONE_ID) !== -1;
    })[0];
  }).then(project => {
    console.log('Stage 2');
    if (!project) {
      // Project 新規追加
      console.log('Create Project.');
      const path = MILESTONE_URL.split('/').slice(3).join('/');
      const url = `Milestone : <a href='/${path}'>${MILESTONE_ID}</a>`;
      const json = {name: MILESTONE_TITLE, body: url};
      return request('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/projects`, json);
    } else if (project.name !== MILESTONE_TITLE) {
      // 名前だけアップデートする。(Description はそのまま)
      console.log(`Update Project Name.`);
      const json = {name: MILESTONE_TITLE, body: project.body};
      return request('PATCH', `/projects/${project.id}`, json);
    } else {
      console.log('Project exists.');
      return project;
    }
  }).then(project => {
    console.log('Stage 3');
    // ToDo / Doing / Done のカラム生成
    return request('GET', `/projects/${project.id}/columns`).then(columns => {
      return Promise.all(['ToDo', 'Doing', 'Done'].map(name => {
        const column = columns.filter(column => column.name === name);
        if (column.length) {
          // カードの配列を返す
          console.log(`Column : ${name} exists. Search cards.`);
          return request('GET', `/projects/columns/${column[0].id}/cards`).then(cards => {
            return {column: column[0], card: cards.filter(card => card.content_url === ISSUE_URL)[0]};
          });
        } else {
          // カラムを生成して、空配列を返す
          console.log(`Column : ${name} not exists. Create column.`);
          return request('POST', `/projects/${project.id}/columns`, {name: name}).then((column) => {
            return {column: column, card: undefined};
          });
        }
      }));
    });
  }).then(columns => {
    console.log('Stage 4');
    if (ISSUE_STATE === 'closed') {
      // 削除
      return Promise.all(columns.map(column => {
        console.log(`Find closed card in column ${column.column.name}.`);
        const card = column.card;
        if (card) {
          console.log('Remove card.');
          return request('DELETE', `/projects/columns/cards/${card.id}`);
        }
      }));
    } else {
      // Todo に追加 (他のカラムに存在した場合は何も変化なし)
      console.log(`Card is not closed.`);
      if (!columns.filter(column => column.card).length) {
        console.log('Card create.');
        const column = columns[0].column;
        const json = {content_id: ISSUE_ID, content_type: 'Issue'};
        return request('POST', `/projects/columns/${column.id}/cards`, json);
      }
    }
  }).then(() => {
    console.log('Success. Return 200.');
    return context.succeed({statusCode: 200});
  }).catch(e => {
    console.log(e);
    return context.fail(e);
  });
};

function request (method, path, json) {
  return new Promise(function(resolve, reject) {

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Awesome-Octocat-App',
        'Authorization': `token ${process.env.token}`,
        'Accept': 'application/vnd.github.inertia-preview+json'
      }
    };
    let data = undefined;
    if (json !== undefined) {
      data = JSON.stringify(json);
      options.headers['Content-Type'] = 'application/json; charser=UTF-8';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(options, res => {
        let data = '';
        res.on('data', d => {
          data += d;
        });
        res.on('end', () => {
          console.log(`Status-Code : ${res.statusCode}.`);
          switch (res.statusCode) {
            case 200:
            case 201: // POST
              resolve(JSON.parse(data));
              break;
            case 204: // DELETE
            case 422: // Duplicate Insert
              resolve();
              break;
            default:
              reject(data);
              break;
          }
        });
      }
    );
    req.on('error', (e) => {
      console.error(e);
      reject(e);
    });
    req.end(data);
  });
}
