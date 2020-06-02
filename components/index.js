import React from "react";
import { makeStyles } from "@material-ui/core/styles";

export default ({
  $models,
  $page
}) => {
  const classes = makeStyles(theme => ({
    root: {
      display: 'flex'
    }
  }))();

  return (
    <main className={classes.root}>
      {$models}
    </main>
  );
};
