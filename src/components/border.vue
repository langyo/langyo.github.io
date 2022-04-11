<template>
  <svg width="0" height="0">
    <defs>
      <clipPath :id="uniqueSvgId">
        <rect x="0" y="0" :width="36 * scale" :height="10 * scale" />
        <rect x="0" y="0" :width="10 * scale" :height="36 * scale" />
        <rect x="0" :y="26 * scale" :width="82 * scale" :height="10 * scale" />
        <rect :x="26 * scale" y="0" :width="10 * scale" :height="82 * scale" />
        <rect x="0" :y="46 * scale" :width="102 * scale" :height="10 * scale" />
        <rect :x="46 * scale" y="0" :width="10 * scale" :height="102 * scale" />
        <rect x="0" :y="46 * scale" :width="10 * scale" :height="36 * scale" />
        <rect x="0" :y="72 * scale" :width="36 * scale" :height="10 * scale" />
        <rect :x="46 * scale" y="0" :width="36 * scale" :height="10 * scale" />
        <rect :x="72 * scale" y="0" :width="10 * scale" :height="36 * scale" />
        <rect x="0" :y="92 * scale" :width="56 * scale" :height="10 * scale" />
        <rect :x="92 * scale" y="0" :width="10 * scale" :height="56 * scale" />
        <rect x="0" :y="92 * scale" :width="10 * scale" :height="36 * scale" />
        <rect :x="92 * scale" y="0" :width="36 * scale" :height="10 * scale" />
        <rect x="0" :y="118 * scale" :width="16 * scale" :height="10 * scale" />
        <rect :x="118 * scale" y="0" :width="10 * scale" :height="16 * scale" />
        <rect :x="10 * scale" :y="118 * scale" :width="10 * scale" :height="36 * scale" />
        <rect :x="118 * scale" :y="10 * scale" :width="36 * scale" :height="10 * scale" />
        <rect x="0" :y="144 * scale" :width="16 * scale" :height="10 * scale" />
        <rect :x="144 * scale" y="0" :width="10 * scale" :height="16 * scale" />
        <rect x="0" :y="144 * scale" :width="10 * scale" :height="100 * scale" />
        <rect :x="144 * scale" y="0" :width="100 * scale" :height="10 * scale" />
      </clipPath>
    </defs>
  </svg>
  <div class="border-outside">
    <div class="border-top-left" />
    <div class="border-top-right" />
    <div class="border-bottom-left" />
    <div class="border-bottom-right" />
    <div class="border-outside-shadow">
      <div class="border-top-left" />
      <div class="border-top-right" />
      <div class="border-bottom-left" />
      <div class="border-bottom-right" />
    </div>
  </div>
  <div class="content">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.border-outside {
  position: absolute;
  width: v-bind(widthOutside);
  height: v-bind(heightOutside);
  left: 0px;
  top: 0px;
  z-index: 1;
  pointer-events: none;
}

.border-outside-shadow {
  position: absolute;
  top: 0px;
  left: 0px;
  width: 100%;
  height: 100%;
  transform: scale(1.005);
  filter: blur(2px);
  opacity: 0.6;
}

.border-inside {
  width: 400px;
  height: 300px;
  background: linear-gradient(to bottom, var(--color-primary-half), var(--color-primary-most));
  clip-path: v-bind(uniqueSvgIdUrl);
}

.border-top-left {
  @extend .border-inside;
  position: absolute;
  left: 0px;
  top: 0px;
  transform: scale(1, 1);
}

.border-top-right {
  @extend .border-inside;
  position: absolute;
  right: 0px;
  top: 0px;
  transform: scale(-1, 1);
}

.border-bottom-left {
  @extend .border-inside;
  position: absolute;
  left: 0px;
  bottom: 0px;
  transform: scale(1, -1);
}

.border-bottom-right {
  @extend .border-inside;
  position: absolute;
  right: 0px;
  bottom: 0px;
  transform: scale(-1, -1);
}

.content {
  position: absolute;
  width: v-bind(widthInside);
  height: v-bind(heightInside);
  left: 4px;
  top: 4px;
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { generate } from 'shortid';

const props = defineProps<{
  width?: number | string;
  height?: number | string;
  scale?: number;
}>();

const uniqueSvgId = ref(generate());
const uniqueSvgIdUrl = computed(() => `url(#${uniqueSvgId.value})`);
const widthOutside = computed(() =>
  props.width ? `${props.width}${typeof props.width === 'number' ? 'px' : ''}` : '100%'
);
const heightOutside = computed(() =>
  props.height ? `${props.height}${typeof props.height === 'number' ? 'px' : ''}` : '100%'
);
const widthInside = computed(() => `calc(${widthOutside.value} - 8px)`);
const heightInside = computed(() => `calc(${heightOutside.value} - 8px)`);
</script>
