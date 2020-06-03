import React from "react";
import { makeStyles } from "@material-ui/core/styles";

import {
  Paper,
  Grid,
  Typography,
  Button
} from "@material-ui/core";

export default ({
}) => {
  const classes = makeStyles(theme => ({
    paper: {
      padding: 8,
      margin: 8
    }
  }))();

  return [
    <Paper className={classes.paper}>
      <Grid container>
        <Grid item xs />
        <Grid item xs={6}>
          <Typography variant="h6">{"Hi, I am langyo!"}</Typography>
        </Grid>
        <Grid item xs />
      </Grid>
    </Paper>,
  ];
};
