import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { withStyles } from '@material-ui/core/styles';
import Fade from '@material-ui/core/Fade';

import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';

const styles = theme => ({
  paper: {
    width: 400,
    height: 400,
    margin: 'auto',
    paddingTop: 50,
    textAlign: 'center',
    opacity: 0.8
  }
});

class Message extends React.Component {
  static propTypes = {
    // Dispatcher
    onGenerate: PropTypes.func,
    // State
    open: PropTypes.bool,
    text: PropTypes.string
  };

  render() {
    const { classes } = this.props;

    return (
      <Fade in={this.props.open}>
        <div>
          <Paper className={classes.paper}>
            <Typography variant='h6'>
              {'临时站点建设中'}
            </Typography>
            <Typography variant='h6'>
              {'左上角有个菜单按钮，可以呼出抽屉'}
            </Typography>
          </Paper>
        </div>
      </Fade>
    );
  }
}

export default withStyles(styles)(Message);
