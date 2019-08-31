export const mapStateToProps = (state) => ({
  ...state.pages.main,
  open: state.views.drawer.show === 'main'
});

export const mapDispatchToProps = (dispatch, ownProps) => ({
});
