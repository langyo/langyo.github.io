import React from 'react';
import Head from 'next/head';

import { connect } from 'react-redux';
import actions from '../src/actions';

import classnames from "classnames";
import { makeStyles } from "@material-ui/core/styles";

import {
  Typography,
  AppBar,
  Toolbar
} from "@material-ui/core";

import MainPage from "../components/pages/mainPage";

export default connect(state => ({ state }), dispatch => ({
  dispatcher: {
    views: {

    },
    pages: {
      mainPage: {

      }
    }
  }
}))(props => {
  React.useEffect(() => {
    const jssStyles = document.querySelector('#jss-server-side');
    if (jssStyles) {
      jssStyles.parentNode.removeChild(jssStyles);
    }
  }, []);

  const classes = makeStyles(theme => ({
    center: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column"
    },
    fillWidth: {
      width: "80%"
    }
  }))();

  return ([
    <Head>
      <title>建设中</title>
      <link rel='icon' href='/favicon.ico' />
    </Head>,
    <div className={classnames(classes.center)}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">
            伊欧的小站
          </Typography>
        </Toolbar>
      </AppBar>
      <div className={classnames(classes.fillWidth, classes.center)}>
        <MainPage />
      </div>
    </div>
  ]);
});
