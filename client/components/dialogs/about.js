import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { withStyles } from '@material-ui/core/styles';

import Fade from '@material-ui/core/Fade';
import Grow from '@material-ui/core/Grow';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';

const styles = theme => ({
  textAlignRight: {
    textAlign: 'right'
  }
});

class About extends React.Component {
  static propTypes = {
    // State
    show: PropTypes.bool,
    // Dispatcher
    onClose: PropTypes.func
  }

  render() {
    const { classes } = this.props;

    return (
      <Dialog
        open={this.props.show}
        onClose={this.props.onClose}
        scroll='paper'
      >
        <DialogTitle>关于</DialogTitle>
        <DialogContent>
          <Typography paragraph variant='body1'>
            {'这是个临时的站点，暂时开站纯属无奈，不然阿里云要把我备案注销掉啊 orz'}
          </Typography>
          <Typography paragraph variant='body1' className={classes.textAlignRight}>
            {'备案号苏 ICP 备 19036136'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={this.props.onClose} color='primary'>
            {'确定'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
}

export default withStyles(styles)(About);