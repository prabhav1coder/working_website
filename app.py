from flask import Flask, request, send_file, jsonify
import tensorflow as tf
from PIL import Image
import pillow_avif  # Ensure AVIF support
import numpy as np
import io
import logging
from flask_cors import CORS
from werkzeug.exceptions import BadRequest

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})  # Restrict CORS to Node server

# Logger setup
# logger = logging.getLogger(__name__)
# logger.setLevel(logging.INFO)
# file_handler = logging.FileHandler('app.log')
# stream_handler = logging.StreamHandler()
# formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
# file_handler.setFormatter(formatter)
# stream_handler.setFormatter(formatter)
# logger.addHandler(file_handler)
# logger.addHandler(stream_handler)

# Load GAN model
try:
    generator_model = tf.keras.models.load_model('generator_model.h5')
except Exception as e:
    raise

# Image preprocessing and postprocessing functions
def preprocess_image(image):
    # Convert image to numpy array and ensure it has 3 channels (RGB)
    image_array = np.array(image)

    # Resize the image to 256x256
    image = image.resize((256, 256))
    image_array = np.array(image)

    if image_array.shape[-1] == 1:  # Grayscale image
        image_array = np.stack([image_array.squeeze()] * 3, axis=-1)
    elif image_array.shape[-1] == 4:  # RGBA image
        image_array = image_array[..., :3]  # Convert to RGB by removing alpha channel
    
    # Normalize to [0, 1] range
    return np.expand_dims(image_array / 255.0, axis=0)


def postprocess_image(image_array, output_format='JPEG'):
    # Scale from [-1, 1] to [0, 1]
    image_array = (image_array + 1) / 2.0  # Adjust based on the model's output range
    image_array = (image_array * 255).astype(np.uint8)
    
    image = Image.fromarray(image_array)

    # Ensure correct mode based on output format
    if output_format.upper() == 'PNG':
        image = image.convert("RGBA")  # For PNG
    elif output_format.upper() in ['WEBP', 'AVIF', 'JPEG']:
        image = image.convert("RGB")  # Ensure RGB for JPEG, WEBP, AVIF
    
    return image

@app.route('/process-image', methods=['POST'])
def process_image():
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image file received!'}), 400

    try:
        # Get image file and optional output format from request
        image_file = request.files['image']
        output_format = request.form.get('output_format', 'JPEG').upper()

        # Validate output format
        if output_format not in ['JPEG', 'PNG', 'WEBP', 'AVIF']:
            return jsonify({'error': 'Unsupported output format. Please use JPEG, PNG, WEBP, or AVIF.'}), 400

        # Load and convert image to RGB if necessary
        image = Image.open(image_file.stream)
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Preprocess image, predict with model, and postprocess output
        input_tensor = preprocess_image(image)
        
        output_tensor = generator_model.predict(input_tensor)
        
        output_image = postprocess_image(output_tensor[0], output_format)

        # Save processed image to a buffer to send as response
        image_io = io.BytesIO()
        output_image.save(image_io, format=output_format)
        image_io.seek(0)

        return send_file(image_io, mimetype=f'image/{output_format.lower()}')
    except Exception as e:
        return jsonify({'error': 'Failed to process image. Please try again.'}), 500

if __name__ == '__main__':
    app.run(port=5001)
