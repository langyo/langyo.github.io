import React from "react";
import PropTypes from "prop-types";
import classNames from 'classnames';
import { withStyles } from "@material-ui/core/styles";

import CssBaseline from "@material-ui/core/CssBaseline";
import Divider from "@material-ui/core/Divider";
import Drawer from "@material-ui/core/Drawer";
import Grid from "@material-ui/core/Grid";
import Hidden from "@material-ui/core/Hidden";

import AppBar from "@material-ui/core/AppBar";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";
import Fab from "@material-ui/core/Fab";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import Paper from "@material-ui/core/Paper";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";

import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardMedia from '@material-ui/core/CardMedia';
import CardContent from '@material-ui/core/CardContent';
import CardActions from '@material-ui/core/CardActions';

import MenuIcon from "mdi-material-ui/Menu";
import AddIcon from "mdi-material-ui/Plus";

const drawerWidth = 240;

const styles = theme => ({
  root: {
    display: "flex"
  },
  appBar: {
    marginLeft: drawerWidth
  },
  menuButton: {
    marginRight: 20,
  },
  toolbar: theme.mixins.toolbar,
  drawerPaper: {
    width: drawerWidth
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.unit * 3
  },
  fab: {
    position: 'absolute',
    bottom: theme.spacing.unit * 2,
    right: theme.spacing.unit * 2,
  },
  paper: {
    ...theme.mixins.gutters(),
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2
  }
});

class ResponsiveDrawer extends React.Component {
  state = {
    open: false
  };

  handleDrawerToggle = () => {
    this.setState(state => ({ open: !state.open }));
  };

  render() {
    const { classes, theme } = this.props;

    return (
      <div className={classes.root}>
        <CssBaseline />
        <AppBar position="fixed" className={classes.appBar}>
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="打开侧边栏"
              onClick={this.handleDrawerToggle}
              className={classes.menuButton}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" color="inherit" noWrap>
              Building...
            </Typography>
          </Toolbar>
        </AppBar>
        <nav>
          <Drawer
            open={this.state.open}
            onClose={this.handleDrawerToggle}
            classes={{
              paper: classes.drawerPaper
            }}
          >
            <List>
              <ListItem button key={1} disabled>
                <ListItemText primary={"No any content"} />
              </ListItem>
            </List>
            <Divider />
          </Drawer>
        </nav>
        <main className={classes.content}>
          <div className={classes.toolbar} />
          <Grid container xs={20}>
            <Grid item xs />
            <Grid item xs={6}>
              <Paper className={classes.paper}>
                <Typography paragraph variant="h5">
                  博客正在建设中，敬请期待！
                </Typography>
                <Typography paragraph variant="h6">
                  P.S. 严格来讲，这并不是一个传统的博客。该博客将完成我几年前就有的计划，实现一个笔记存贮与整理平台。
                </Typography>
              </Paper>
              <Fab className={classes.fab}>
                <AddIcon />
              </Fab>
            </Grid>
            <Grid item xs />
          </Grid>
        </main>
      </div>
    );
  }
}

ResponsiveDrawer.propTypes = {
  classes: PropTypes.object.isRequired,
  container: PropTypes.object,
  theme: PropTypes.object.isRequired
};

export default withStyles(styles, { withTheme: true })(ResponsiveDrawer);
