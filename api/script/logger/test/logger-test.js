const Logger = require('../index');

Logger.info('this is an info')
  .setSessionId('this is session id')
  .setURL('https://logs.pg.lan')
  .setData({this_is_data: 'simple json'})
  .log();

function test() {
  Logger.error('this is an error')
    .setSessionId('this is session id')
    .setURL('https://logs.pg.lan')
    .setData({this_is_data: 'simple json'})
    .log();

  const err = new Error('Something went wrong');
  Logger.error('this is an actual error').setError(err).log();

  Logger.instance('').setData({data: 'data'}).log();
}

test();
