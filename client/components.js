const requireFunc = require.context('./components', true, /\.js$/);

let components = {};
requireFunc.keys().forEach(key => {
  let path = /^\.\/(.*)\.js$/.exec(key)[1].split('/');
  const dfs = obj => {
    let head = path.shift();
    if (path.length > 0) {
      if (obj[head]) obj[head] = dfs(obj[head]);
      else obj[head] = dfs({});
    } else {
      obj[head] = requireFunc(key);
    }
    return obj;
  }
  components = dfs(components);
});

export default components;