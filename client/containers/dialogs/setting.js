export const mapStateToProps = (state) => {
  return {
    ...state.views.theme,
    show: state.views.dialog.show === 'setting'
  };
};

export const mapDispatchToProps = (dispatch, ownProps) => ({
  onClose: () => dispatch({
    type: 'views.dialog.reset'
  })
  ,
  onToggleNativeMode: () => dispatch({
    type: 'views.theme.toggleNative'
  })
});
