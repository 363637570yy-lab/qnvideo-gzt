<template>
  <section class="section card">
    <div class="section-title">剧集信息</div>
    <el-form :model="infoForm" label-width="110px" label-position="left" class="info-form">
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="标题">
            <el-input v-model="infoForm.title" placeholder="剧集标题" @blur="$emit('save-info')" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="图片/视频风格">
            <el-select v-model="infoForm.style" placeholder="选择全剧统一风格" clearable style="width: 100%" @change="$emit('save-info')">
              <el-option-group label="写实 / 影视">
                <el-option label="写实" value="realistic" />
                <el-option label="电影感" value="cinematic" />
                <el-option label="纪录片" value="documentary" />
                <el-option label="黑色电影" value="noir" />
                <el-option label="复古胶片" value="retro film" />
                <el-option label="恐怖" value="horror" />
              </el-option-group>
              <el-option-group label="动漫 / 卡通">
                <el-option label="日本动漫" value="anime style" />
                <el-option label="欧美漫画" value="comic style" />
                <el-option label="卡通" value="cartoon" />
              </el-option-group>
              <el-option-group label="中国风格">
                <el-option label="国画水墨" value="ink wash" />
                <el-option label="中国风" value="chinese style" />
                <el-option label="古装" value="historical" />
                <el-option label="武侠" value="wuxia" />
              </el-option-group>
              <el-option-group label="绘画艺术">
                <el-option label="水彩" value="watercolor" />
                <el-option label="油画" value="oil painting" />
                <el-option label="素描" value="sketch" />
                <el-option label="版画" value="woodblock print" />
                <el-option label="印象派" value="impressionist" />
              </el-option-group>
              <el-option-group label="幻想 / 科幻">
                <el-option label="奇幻" value="fantasy" />
                <el-option label="暗黑奇幻" value="dark fantasy" />
                <el-option label="科幻" value="sci-fi" />
                <el-option label="赛博朋克" value="cyberpunk" />
                <el-option label="蒸汽朋克" value="steampunk" />
                <el-option label="末世废土" value="post-apocalyptic" />
              </el-option-group>
              <el-option-group label="数字 / 现代">
                <el-option label="3D 渲染" value="3d render" />
                <el-option label="像素风" value="pixel art" />
                <el-option label="低多边形" value="low poly" />
                <el-option label="极简" value="minimalist" />
                <el-option label="唯美梦幻" value="dreamy" />
              </el-option-group>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="画面比例">
            <el-select v-model="infoForm.aspect_ratio" style="width: 100%" @change="$emit('save-info')">
              <el-option label="16:9 横屏（默认）" value="16:9" />
              <el-option label="9:16 竖屏（短视频）" value="9:16" />
              <el-option label="3:4 竖版" value="3:4" />
              <el-option label="1:1 方形" value="1:1" />
              <el-option label="4:3 传统横屏" value="4:3" />
              <el-option label="21:9 宽银幕" value="21:9" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="故事梗概">
            <el-input v-model="infoForm.description" type="textarea" :rows="3" placeholder="一句话描述故事梗概" @blur="$emit('save-info')" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </section>
</template>

<script setup>
defineProps({
  infoForm: { type: Object, required: true },
})

defineEmits(['save-info'])
</script>
