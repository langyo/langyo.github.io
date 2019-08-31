import React from 'react';
import { render } from 'react-dom';

import { Provider } from 'react-redux';

import Main from './containers/views/main';
import store from './store';

render(
  <Provider store={store}>
    <Main />
  </Provider>,
  document.getElementById('content')
);