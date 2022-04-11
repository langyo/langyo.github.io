<template>
  <div class="component" />
</template>

<style scoped lang="scss">
.component {
  width: v-bind(size);
  height: v-bind(size);
  background-image: linear-gradient(
    var(--color-light) 50%,
    var(--color-primary) 50%
  );
  display: flex;
  align-items: center;
  box-shadow: 0 0 1em rgba(0, 0, 0, 0.3);
  opacity: 0.8;
  animation: rotating linear 5s infinite;
}

@keyframes rotating {
  to {
    transform: rotate(1turn);
  }
}

@mixin component-inside($inner, $outer) {
  content: '';
  width: 50%;
  height: 50%;
  background-color: $inner;
  box-sizing: border-box;
  border: calc(v-bind(size) / 8 * 1.5) solid $outer;
}

.component::before {
  @include component-inside(var(--color-light), var(--color-primary));
}

.component::after {
  @include component-inside(var(--color-primary), var(--color-light));
}

.component,
.component::before,
.component::after {
  border-radius: 50%;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ size?: number | string }>();
const size = computed(() =>
  props.size
    ? `${props.size}${typeof props.size === 'number' ? 'px' : ''}`
    : '32px'
);
</script>
