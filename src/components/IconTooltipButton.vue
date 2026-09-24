<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps({
  content: {
    type: String,
    required: true,
  },
  placement: {
    type: String,
    default: 'top',
  },
})

const supportsHover = ref(false)
let hoverQuery

function updateHoverSupport(event) {
  supportsHover.value = event.matches
}

onMounted(() => {
  hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
  updateHoverSupport(hoverQuery)

  if (hoverQuery.addEventListener) hoverQuery.addEventListener('change', updateHoverSupport)
  else hoverQuery.addListener(updateHoverSupport)
})

onBeforeUnmount(() => {
  if (!hoverQuery) return
  if (hoverQuery.removeEventListener) hoverQuery.removeEventListener('change', updateHoverSupport)
  else hoverQuery.removeListener(updateHoverSupport)
})
</script>

<template>
  <mdui-tooltip :content="content" :placement="placement" trigger="hover" :disabled="!supportsHover">
    <mdui-button-icon v-bind="$attrs">
      <slot></slot>
    </mdui-button-icon>
  </mdui-tooltip>
</template>
