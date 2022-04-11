<template>
  <div class="share-buttons-background" />
  <div class="share-buttons-border">
    <div
      class="share-button-border"
      v-for="({ icon, target, qrcode }, index) of list"
      :key="index"
    >
      <div
        class="share-button"
        @click="target && openResource(target)"
        @mouseenter="setHover(index)"
        @mouseleave="setHover(-1)"
      >
        <corona-border :scale="0.1">
          <div class="share-image-border">
            <i class="share-icon" v-html="icon" />
          </div>
        </corona-border>
      </div>
      <template v-if="qrcode">
        <transition
          enter-from-class="share-qrcode-border-transform-from"
          enter-to-class="share-qrcode-border-transform-to"
          leave-from-class="share-qrcode-border-transform-to"
          leave-to-class="share-qrcode-border-transform-from"
          appear
        >
          <div class="share-qrcode-border" v-show="isHover === index">
            <corona-border :scale="0.1">
              <div class="share-image-border">
                <div
                  class="share-qrcode"
                  :style="{
                    background: `center / cover no-repeat url(${qrcode})`
                  }"
                />
              </div>
            </corona-border>
          </div>
        </transition>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.share-buttons-background {
  position: absolute;
  width: 60%;
  height: 128px;
  left: 20%;
  bottom: calc(5% + 48px);
  background: var(--color-dark-less);
  backdrop-filter: blur(2px);
  border-radius: 4px;
  z-index: -1;
}

.share-buttons-border {
  position: absolute;
  width: 60%;
  height: 144px;
  left: 20%;
  bottom: 5%;
  padding-left: 72px;
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.share-button-border {
  position: relative;
  width: 128px;
  height: 100%;
}

.share-button {
  width: 64px;
  height: 64px;
  background: radial-gradient(var(--color-primary-most), transparent);
  box-shadow: 0 0 4px 2px var(--color-primary-half);
  cursor: pointer;
  transform: rotate(45deg);
  transition: all 0.3s;
  &:hover {
    box-shadow: 0 0 4px 4px var(--color-primary-half);
  }
  &:active {
    background: radial-gradient(var(--color-primary), transparent);
    box-shadow: 0 0 4px 4px var(--color-primary-half);
  }
}

.share-icon {
  width: 48px;
  height: 48px;
  transform: rotate(-45deg);
}

.share-qrcode-border {
  position: absolute;
  width: 128px;
  height: 128px;
  left: -32px;
  top: -144px;
  background: var(--color-dark-most);
  box-shadow: 0 0 4px 2px var(--color-primary-half);
  transform: rotate(45deg);
  pointer-events: none;
  transition: all 0.3s;
}

.share-qrcode-border-transform-from {
  top: -72px;
  opacity: 0;
}

.share-qrcode-border-transform-to {
  top: -144px;
  opacity: 1;
}

.share-image-border {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-qrcode {
  width: 96px;
  height: 96px;
  transform: rotate(-45deg);
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  list: { icon: any; target?: string; qrcode?: string }[];
}>();
const list = computed(() => props.list);

function openResource(target: string) {
  window.open(target);
}

const isHover = ref(-1);

function setHover(val: number) {
  isHover.value = val;
}
</script>

<script lang="ts">
import Border from './border.vue';

export default {
  components: {
    'corona-border': Border
  }
};
</script>
