const requireFunc = require.context('./containers', true, /\.js$/);

let containers = {};
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
  containers = dfs(containers);
});

export default containers;