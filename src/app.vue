<template>
  <layout-background />
  <article>
    <router-view />
  </article>
</template>

<style lang="scss">
*,
html,
body {
  font-family: serif;
  color: rgba(255, 255, 255, 0.8);
  margin: 0px;
  box-sizing: border-box;
}

body {
  --color-background-mainly: rgba(40, 32, 23, 0.8);
  --color-background-header: rgba(177, 147, 112, 0.5);
  --color-background-footer: rgba(111, 94, 78, 0.5);

  --color-primary: rgb(199, 120, 31);
  --color-primary-most: rgba(199, 120, 31, 0.8);
  --color-primary-half: rgba(199, 120, 31, 0.5);
  --color-primary-less: rgba(199, 120, 31, 0.2);

  --color-secondary: rgb(129, 108, 24);
  --color-secondary-most: rgba(129, 108, 24, 0.8);
  --color-secondary-half: rgba(129, 108, 24, 0.5);
  --color-secondary-less: rgba(129, 108, 24, 0.2);

  --color-dark: rgb(0, 0, 0);
  --color-dark-most: rgba(0, 0, 0, 0.8);
  --color-dark-half: rgba(0, 0, 0, 0.5);
  --color-dark-less: rgba(0, 0, 0, 0.2);

  --color-light: rgb(255, 255, 255);
  --color-light-most: rgba(255, 255, 255, 0.8);
  --color-light-half: rgba(255, 255, 255, 0.5);
  --color-light-less: rgba(255, 255, 255, 0.2);
}

button,
h1,
h2,
h3,
h4,
h5,
h6,
a {
  font-family: cursive;
  outline: none;
  text-decoration: none;
}

button {
  text-align: center;
  user-select: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  background: linear-gradient(
    to bottom,
    var(--color-primary-half),
    var(--color-primary-most),
    var(--color-primary-half)
  );
  border: 1px solid var(--color-primary-half);
  outline: transparent;
  box-shadow: 0 0 4px 2px var(--color-primary-half);
  transition: all 0.3s;
  &:hover {
    box-shadow: 0 0 4px 4px var(--color-primary-half);
  }
  &:active {
    background: linear-gradient(
      to bottom,
      var(--color-primary-most),
      var(--color-primary),
      var(--color-primary-most)
    );
    box-shadow: 0 0 4px 4px var(--color-primary-half);
  }
}
</style>

<style lang="scss" scoped>
body {
  background: var(--color-background-mainly);
  overflow: hidden;
}

article {
  position: fixed;
  width: 100%;
  height: calc(100% - 72px);
  left: 0px;
  top: 72px;
}
</style>

<script lang="ts">
import LayoutBackground from '@/layouts/background.vue';
import LayoutFooter from '@/layouts/footer.vue';

export default {
  components: {
    'layout-background': LayoutBackground,
    'layout-footer': LayoutFooter
  }
};
</script>
