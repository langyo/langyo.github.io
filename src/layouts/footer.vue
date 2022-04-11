<template>
  <footer class="border">
    <div
      v-for="(content, index) of ($tm('footer.disclaimer') as string[])"
      :key="index"
      class="item"
    >
      {{ content }}
    </div>
    <div class="item">
      <a
        v-for="({ text, link, image }, index) of ($tm('recordInformation') as {
          text: string;
          link?: string;
          image?: string;
        }[])"
        :key="index"
        class="item-row"
        :href="link"
        @click="(event) => (window.open(link), event.preventDefault())"
      >
        <img v-if="image" :src="image" />
        {{ text }}
      </a>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
.border {
  position: fixed;
  width: 100%;
  height: 72px;
  left: 0px;
  bottom: 0px;
  padding: 4px;
  background: var(--color-background-footer);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.item {
  font-size: 16px;
  font-family: serif;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.item-row {
  @extend .item;
  margin: 0px 8px;
  cursor: pointer;
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { tm: $tm } = useI18n();
</script>
