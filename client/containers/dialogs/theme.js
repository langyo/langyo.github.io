export const mapStateToProps = (state) => {
  return {
    ...state.views.theme,
    show: state.views.dialog.show === 'theme'
  };
};

export const mapDispatchToProps = (dispatch, ownProps) => ({
  onClose: () => dispatch({
    type: 'views.dialog.reset'
  }),
  onChangePrimaryColor: (color) => dispatch({
    type: 'views.theme.color.changePrimary',
    color
  }),
  onChangeSecondaryColor: (color) => dispatch({
    type: 'views.theme.color.changeSecondary',
    color
  })
});
