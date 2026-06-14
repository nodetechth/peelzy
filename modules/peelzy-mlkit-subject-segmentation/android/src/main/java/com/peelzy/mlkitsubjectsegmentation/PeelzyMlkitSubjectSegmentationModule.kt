package com.peelzy.mlkitsubjectsegmentation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.tasks.await
import java.io.File
import java.io.FileOutputStream

class PeelzyMlkitSubjectSegmentationModule : Module() {
  private val maxInputEdge = 1024
  private val alphaMaskSize = 64

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  override fun definition() = ModuleDefinition {
    Name("PeelzyMlkitSubjectSegmentation")

    AsyncFunction("segmentSubjectAsync") Coroutine { imageUri: String ->
      val startedAt = SystemClock.elapsedRealtime()
      val inputImage = createInputImage(Uri.parse(imageUri))
      val options = SubjectSegmenterOptions.Builder()
        .enableForegroundBitmap()
        .build()
      val segmenter = SubjectSegmentation.getClient(options)
      val result = segmenter.process(inputImage).await()
      val foreground = result.foregroundBitmap
        ?: throw IllegalStateException("ML Kit did not return a foreground bitmap.")
      val alphaAnalysis = analyzeAlpha(foreground)
      val outputFile = File(
        context.cacheDir,
        "peelzy-mlkit-subject-${System.currentTimeMillis()}.png",
      )

      FileOutputStream(outputFile).use { stream ->
        foreground.compress(Bitmap.CompressFormat.PNG, 100, stream)
      }

      mapOf(
        "uri" to Uri.fromFile(outputFile).toString(),
        "subjectCount" to result.subjects.size,
        "width" to foreground.width,
        "height" to foreground.height,
        "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        "contentBounds" to alphaAnalysis.bounds,
        "alphaMask" to alphaAnalysis.maskHex,
      )
    }
  }

  private data class AlphaAnalysis(
    val bounds: Map<String, Double>,
    val maskHex: String,
  )

  private fun analyzeAlpha(bitmap: Bitmap): AlphaAnalysis {
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    var minX = bitmap.width
    var minY = bitmap.height
    var maxX = -1
    var maxY = -1

    for (y in 0 until bitmap.height) {
      for (x in 0 until bitmap.width) {
        val alpha = (pixels[y * bitmap.width + x] ushr 24) and 0xff
        if (alpha > 8) {
          minX = minOf(minX, x)
          minY = minOf(minY, y)
          maxX = maxOf(maxX, x)
          maxY = maxOf(maxY, y)
        }
      }
    }

    val maskBytes = ByteArray((alphaMaskSize * alphaMaskSize + 7) / 8)
    for (maskY in 0 until alphaMaskSize) {
      val startY = maskY * bitmap.height / alphaMaskSize
      val endY = maxOf(startY + 1, (maskY + 1) * bitmap.height / alphaMaskSize)

      for (maskX in 0 until alphaMaskSize) {
        val startX = maskX * bitmap.width / alphaMaskSize
        val endX = maxOf(startX + 1, (maskX + 1) * bitmap.width / alphaMaskSize)
        var isOpaque = false

        loop@ for (y in startY until minOf(endY, bitmap.height)) {
          for (x in startX until minOf(endX, bitmap.width)) {
            if (((pixels[y * bitmap.width + x] ushr 24) and 0xff) > 8) {
              isOpaque = true
              break@loop
            }
          }
        }

        if (isOpaque) {
          val index = maskY * alphaMaskSize + maskX
          maskBytes[index / 8] =
            (maskBytes[index / 8].toInt() or (1 shl (7 - (index % 8)))).toByte()
        }
      }
    }

    val bounds = if (maxX < minX || maxY < minY) {
      mapOf(
        "x" to 0.0,
        "y" to 0.0,
        "width" to bitmap.width.toDouble(),
        "height" to bitmap.height.toDouble(),
      )
    } else {
      mapOf(
        "x" to minX.toDouble(),
        "y" to minY.toDouble(),
        "width" to (maxX - minX + 1).toDouble(),
        "height" to (maxY - minY + 1).toDouble(),
      )
    }

    return AlphaAnalysis(
      bounds = bounds,
      maskHex = maskBytes.joinToString("") { "%02x".format(it.toInt() and 0xff) },
    )
  }

  private fun createInputImage(uri: Uri): InputImage {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return InputImage.fromFilePath(context, uri)
    }

    val source = ImageDecoder.createSource(context.contentResolver, uri)
    val bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
      val width = info.size.width
      val height = info.size.height
      val longestEdge = maxOf(width, height)

      if (longestEdge > maxInputEdge) {
        val scale = maxInputEdge.toFloat() / longestEdge
        decoder.setTargetSize(
          (width * scale).toInt().coerceAtLeast(1),
          (height * scale).toInt().coerceAtLeast(1),
        )
      }

      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }

    return InputImage.fromBitmap(bitmap, 0)
  }
}
