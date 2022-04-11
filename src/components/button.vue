<template>
  <div
    class="border-outside"
    :style="{
      transform: `scale(${scale || 1})`
    }"
  >
    <div class="border-shadow" />
    <div
      class="border-slice-left"
      :class="{
        'border-slice-left-transform-from': !isHover,
        'border-slice-left-transform-to': isHover
      }"
    >
      <div class="border-left" />
    </div>
    <div
      class="border-slice-right"
      :class="{
        'border-slice-right-transform-from': !isHover,
        'border-slice-right-transform-to': isHover
      }"
    >
      <div class="border-right" />
    </div>
    <button
      class="border-inside"
      @mouseenter="setHover(true)"
      @mouseleave="setHover(false)"
      @click="handleClick"
    >
      <slot />
    </button>
  </div>
</template>

<style scoped lang="scss">
.border-outside {
  position: relative;
  height: min-content;
  width: min-content;
}

.border-inside {
  position: relative;
  margin: 8px 4px;
  padding: 4px 40px;
  height: 56px;
  width: max-content;
  line-height: calc(48px - 8px);
  font-size: 24px;
  color: #fff;
  background: radial-gradient(
    circle,
    var(--color-primary-most),
    var(--color-secondary-most) 90%
  );
  clip-path: polygon(
    24px 50%,
    32px 4px,
    calc(100% - 32px) 4px,
    calc(100% - 24px) 50%,
    calc(100% - 32px) calc(100% - 4px),
    32px calc(100% - 4px)
  );
  cursor: pointer;
  transition: all 0.3s;

  &::before {
    position: absolute;
    left: 0px;
    top: 0px;
    width: 100%;
    height: 100%;
    background: var(--color-primary-most);
    content: '';
    clip-path: polygon(
      24px 50%,
      32px 4px,
      calc(100% - 32px) 4px,
      calc(100% - 24px) 50%,
      calc(100% - 32px) calc(100% - 4px),
      32px calc(100% - 4px),
      24px 50%,
      26px 50%,
      34px calc(100% - 6px),
      calc(100% - 34px) calc(100% - 6px),
      calc(100% - 26px) 50%,
      calc(100% - 34px) 6px,
      34px 6px,
      26px 50%
    );
  }

  &:hover {
    filter: contrast(120%);
  }

  &:active {
    filter: contrast(80%);
  }
}

.border-shadow {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 4px;
  height: calc(100% - 8px);
  background: radial-gradient(
    closest-side,
    var(--color-primary-half),
    var(--color-secondary-half) 60%,
    transparent 100%
  );
  clip-path: polygon(
    12px 4px,
    calc(100% - 12px) 4px,
    calc(100% - 4px) 50%,
    calc(100% - 12px) calc(100% - 4px),
    14px calc(100% - 4px),
    4px 50%
  );
}

.border-slice-left {
  position: absolute;
  top: calc(50% - 32px);
  width: 16px;
  height: 64px;
  clip-path: polygon(
    0% 16px,
    100% 16px,
    100% calc(100% - 16px),
    0% calc(100% - 16px)
  );
  transition: all 0.3s;
}

.border-slice-left-transform-from {
  left: 16px;
}

.border-slice-left-transform-to {
  left: 8px;
}

.border-slice-right {
  position: absolute;
  top: calc(50% - 32px);
  width: 16px;
  height: 64px;
  clip-path: polygon(
    0% 16px,
    100% 16px,
    100% calc(100% - 16px),
    0% calc(100% - 16px)
  );
  transition: all 0.3s;
}

.border-slice-right-transform-from {
  right: 16px;
}

.border-slice-right-transform-to {
  right: 8px;
}

.border-left {
  width: 100%;
  height: 100%;
  background: radial-gradient(
    circle,
    var(--color-primary-most),
    var(--color-secondary-most) 90%
  );
  clip-path: polygon(
    16px 0px,
    20px 0px,
    8px 50%,
    20px 100%,
    16px 100%,
    4px 50%
  );
}

.border-right {
  width: 16px;
  height: 100%;
  background: radial-gradient(
    circle,
    var(--color-primary-most),
    var(--color-secondary-most) 90%
  );
  clip-path: polygon(0px 0px, -4px 0px, 8px 50%, -4px 100%, 0px 100%, 12px 50%);
}
</style>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ scale?: number }>();

const emits = defineEmits<{ (_: 'click', event: MouseEvent): void }>();

const isHover = ref(false);
function setHover(val: boolean) {
  isHover.value = val;
}

function handleClick(event: MouseEvent) {
  emits('click', event);
}
</script>
