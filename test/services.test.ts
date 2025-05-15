import { parseArgs } from '../src/services';

test('parseArgs', () => {
  process.argv = ['/bin/node', 'foobar.js', '--foo=bar', '--fem="baj"', '--foobar', '--input', 'foo.js', '--output', 'bar.js', 'nonflag'];
  expect(parseArgs()).toMatchObject({ _: ['nonflag'], foo: 'bar', fem: 'baj', foobar: true, input: 'foo.js', output: 'bar.js' });
});
