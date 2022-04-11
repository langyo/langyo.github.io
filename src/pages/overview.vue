<template>
  <div class="info-border">
    <h1>{{ $t('overview.title') }}</h1>
    <p>{{ $t('overview.subTitle') }}</p>
  </div>

  <share-icons
    :list="[
      {
        icon: iconBilibili,
        target: $t('shareLinks.bilibili.url')
      },
      {
        icon: iconGithub,
        target: $t('shareLinks.github.url')
      },
      {
        icon: iconMinecraft,
        target: $t('shareLinks.mcbbs.url')
      }
    ]"
  />

  <custom-footer />
</template>

<style scoped lang="scss">
.info-border {
  position: absolute;
  width: 80%;
  height: 40%;
  left: 10%;
  top: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  backdrop-filter: blur(2px);
  background: var(--color-dark-less);
  border-radius: 4px;

  h1 {
    font-size: 64px;
  }

  p {
    font-size: 36px;
  }
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import iconBilibili from '@res/icons/bilibili.svg';
import iconGithub from '@res/icons/github.svg';
import iconMinecraft from '@res/icons/minecraft.svg';

const { t: $t } = useI18n();
</script>

<script lang="ts">
import ShareIcons from '@/components/shareIcons.vue';
import Footer from '@/layouts/footer.vue';

export default {
  components: {
    'share-icons': ShareIcons,
    'custom-footer': Footer
  }
};
</script>
