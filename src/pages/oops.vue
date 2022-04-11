<template>
  <div class="border">
    <div class="icon" />
    <h1>{{ $t('oops.title') }}</h1>
  </div>
</template>

<style lang="scss" scoped>
.border {
  width: 100%;
  height: 80%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  h1 {
    font-size: 32px;
    height: 32px;
    line-height: 32px;
    user-select: none;
  }
}

.icon {
  background: center / 60% no-repeat url('/kane.png'),
    radial-gradient(closest-side, rgb(255, 255, 255), transparent);
  width: 256px;
  height: 256px;
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t: $t } = useI18n();
</script>
