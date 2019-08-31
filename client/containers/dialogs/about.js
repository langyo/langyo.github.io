export const mapStateToProps = (state) => {
  return {
    show: state.views.dialog.show === 'about'
  };
};

export const mapDispatchToProps = (dispatch, ownProps) => ({
  onClose: () => dispatch({
    type: 'views.dialog.reset'
  })
});
