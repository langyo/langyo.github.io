import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import { withStyles } from '@material-ui/core/styles';

import IconButton from '@material-ui/core/IconButton';

import Icon from '@mdi/react';
import { mdiMenu } from '@mdi/js';

const styles = theme => ({
  menuButton: {
    margin: theme.spacing(2),
    zIndex: theme.zIndex.drawer - 1,
    position: 'absolute',
    left: 0,
    top: 0
  }
});

class MainAppbar extends React.Component {
  static propTypes = {
    // Dispatcher
    onToggleDrawer: PropTypes.func
  }

  render() {
    const { classes } = this.props;

    return (
      <div>
        <IconButton
          color='inherit'
          aria-label='打开侧边栏'
          onClick={this.props.onToggleDrawer}
          className={classes.menuButton}
        >
          <Icon path={mdiMenu} size={1} />
        </IconButton>
      </div>
    )
  }
}

export default withStyles(styles)(MainAppbar);
