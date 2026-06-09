<template>
<!-- 隐藏的文件输入框（放在弹窗外层，避免 el-form-item 干扰） -->
<input ref="addCharRefFileInput" type="file" accept="image/*" style="display:none" @change="onRefImageFileChange('character', $event)" />
<input ref="addSceneRefFileInput" type="file" accept="image/*" style="display:none" @change="onRefImageFileChange('scene', $event)" />
<input ref="addPropRefFileInput" type="file" accept="image/*" style="display:none" @change="onRefImageFileChange('prop', $event)" />
<input ref="addPropAddRefFileInput" type="file" accept="image/*" style="display:none" @change="onRefImageFileChange2('addProp', $event)" />


</template>

<script>
export default {
  name: 'ResourceRefImageInputs',
  props: {
    ctx: { type: Object, required: true },
  },
  setup(props) {
    return props.ctx
  },
}
</script>
