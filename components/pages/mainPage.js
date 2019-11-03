import React from "react";
import classnames from "classnames";
import { makeStyles } from "@material-ui/core/styles";

import {
  Paper,
  Typography
} from "@material-ui/core";

export default props => {
  const classes = makeStyles(theme => ({
    centerRow: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "row"
    },
    fillWidth: {
      width: "80%"
    },
    margin: {
      margin: 20
    },
    marginAppbar: {
      marginTop: 30
    }
  }))();

  return [
    <Paper
      className={classnames(
        classes.centerRow,
        classes.fillWidth,
        classes.marginAppbar
      )}
    >
      <Typography className={classes.margin} variant='body1'>
        最近一段时间站长实在太忙，没时间去为自己的服务器定制页面，暂时只能这样了 orz
      </Typography>
    </Paper>
  ]
}